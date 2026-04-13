package gov.usds.ecfr;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Attribute;
import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.parser.Parser;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

final class XmlMetrics {
  private static final int PREVIEW_LENGTH = 360;
  private static final int PREVIEW_CONTENT_LENGTH = PREVIEW_LENGTH - 3;
  private static final java.util.Set<String> SUMMARY_TAGS = java.util.Set.of("HEAD", "P", "FP", "LI", "HD1", "HD2", "HD3", "HD4", "HD5", "HD6", "ENTRY");
  private static final byte[] OPEN_TAG = "<".getBytes(StandardCharsets.UTF_8);
  private static final byte[] CLOSE_TAG = ">".getBytes(StandardCharsets.UTF_8);
  private static final byte[] OPEN_END_TAG = "</".getBytes(StandardCharsets.UTF_8);
  private static final byte[] ATTRIBUTE_SEPARATOR = " ".getBytes(StandardCharsets.UTF_8);
  private static final byte[] ATTRIBUTE_ASSIGNMENT = "=\"".getBytes(StandardCharsets.UTF_8);
  private static final byte[] ATTRIBUTE_END = "\"".getBytes(StandardCharsets.UTF_8);

  private XmlMetrics() {}

  static Result analyze(String xml) {
    var document = Jsoup.parse(xml, "", Parser.xmlParser());
    var summary = summarize(document);
    return new Result(summary.wordCount(), summary.preview(), checksum(document));
  }

  private static String checksum(Document document) {
    try {
      var digest = MessageDigest.getInstance("SHA-256");
      for (var child : document.childNodes()) {
        append(child, digest);
      }
      return hex(digest.digest());
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  private static void append(Node node, MessageDigest digest) {
    if (node instanceof Element element) {
      digest.update(OPEN_TAG);
      update(digest, element.tagName());
      element.attributes().asList().stream()
          .sorted(java.util.Comparator.comparing(Attribute::getKey))
          .forEach(
              attribute -> {
                digest.update(ATTRIBUTE_SEPARATOR);
                update(digest, attribute.getKey());
                digest.update(ATTRIBUTE_ASSIGNMENT);
                update(digest, normalize(attribute.getValue()));
                digest.update(ATTRIBUTE_END);
              });
      digest.update(CLOSE_TAG);
      for (var child : element.childNodes()) {
        append(child, digest);
      }
      digest.update(OPEN_END_TAG);
      update(digest, element.tagName());
      digest.update(CLOSE_TAG);
      return;
    }
    if (node instanceof TextNode textNode) {
      var normalized = normalize(textNode.getWholeText());
      if (!normalized.isBlank()) {
        update(digest, normalized);
      }
      return;
    }
    if (node instanceof DataNode dataNode) {
      var normalized = normalize(dataNode.getWholeData());
      if (!normalized.isBlank()) {
        update(digest, normalized);
      }
    }
  }

  private static String normalize(String value) {
    var builder = new StringBuilder(value.length());
    var pendingSpace = false;

    for (var index = 0; index < value.length(); index += 1) {
      var current = value.charAt(index);
      if (current == '\u00A0' || Character.isWhitespace(current)) {
        pendingSpace = builder.length() > 0;
        continue;
      }
      if (pendingSpace) {
        builder.append(' ');
        pendingSpace = false;
      }
      builder.append(current);
    }

    return builder.toString();
  }

  private static void update(MessageDigest digest, String value) {
    digest.update(value.getBytes(StandardCharsets.UTF_8));
  }

  private static Summary summarize(Document document) {
    var preferred = summarize(document, true);
    return preferred.wordCount() > 0 ? preferred : summarize(document, false);
  }

  private static Summary summarize(Document document, boolean restrictToSummaryTags) {
    var builder = new SummaryBuilder();
    NodeTraversor.traverse(
        new NodeVisitor() {
          private int summaryDepth = 0;

          @Override
          public void head(Node node, int depth) {
            if (node instanceof Element element && SUMMARY_TAGS.contains(element.tagName())) {
              summaryDepth += 1;
              return;
            }
            if (restrictToSummaryTags && summaryDepth == 0) {
              return;
            }
            if (node instanceof TextNode textNode) {
              builder.addSegment(textNode.getWholeText());
              return;
            }
            if (node instanceof DataNode dataNode) {
              builder.addSegment(dataNode.getWholeData());
            }
          }

          @Override
          public void tail(Node node, int depth) {
            if (node instanceof Element element && SUMMARY_TAGS.contains(element.tagName())) {
              summaryDepth -= 1;
            }
          }
        },
        document);
    return builder.build();
  }

  private static final class SummaryBuilder {
    private final StringBuilder preview = new StringBuilder();
    private int wordCount = 0;
    private boolean truncated = false;
    private boolean pendingSpace = false;
    private boolean seenText = false;
    private boolean insideWord = false;

    void addSegment(String value) {
      if (value == null || value.isEmpty()) {
        return;
      }
      if (seenText) {
        pendingSpace = true;
        insideWord = false;
      }
      for (var index = 0; index < value.length(); index += 1) {
        var current = value.charAt(index);
        if (current == '\u00A0' || Character.isWhitespace(current)) {
          pendingSpace = seenText;
          insideWord = false;
          continue;
        }

        if (!insideWord) {
          wordCount += 1;
          insideWord = true;
        }

        if (!truncated) {
          if (pendingSpace && preview.length() > 0) {
            if (preview.length() == PREVIEW_CONTENT_LENGTH) {
              truncated = true;
            } else {
              preview.append(' ');
            }
          }
          pendingSpace = false;

          if (!truncated) {
            if (preview.length() == PREVIEW_CONTENT_LENGTH) {
              truncated = true;
            } else {
              preview.append(current);
            }
          }
        }

        seenText = true;
      }
    }

    Summary build() {
      var previewText = preview.toString();
      if (truncated && !previewText.isEmpty()) {
        previewText += "...";
      }
      return new Summary(wordCount, previewText);
    }
  }

  static String sha256(String value) {
    try {
      return hex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  private static String hex(byte[] value) {
    var builder = new StringBuilder(value.length * 2);
    for (var b : value) {
      builder.append(Character.forDigit((b >>> 4) & 0xF, 16));
      builder.append(Character.forDigit(b & 0xF, 16));
    }
    return builder.toString();
  }

  record Summary(int wordCount, String preview) {}

  record Result(int wordCount, String preview, String checksum) {}
}
