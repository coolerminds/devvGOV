package gov.usds.ecfr;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Attribute;
import org.jsoup.nodes.DataNode;
import org.jsoup.nodes.Document;
import org.jsoup.parser.Parser;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;

final class XmlMetrics {
  private static final int PREVIEW_LENGTH = 360;
  private static final int PREVIEW_CONTENT_LENGTH = PREVIEW_LENGTH - 3;

  private XmlMetrics() {}

  static Result analyze(String xml) {
    var document = Jsoup.parse(xml, "", Parser.xmlParser());
    var canonical = canonicalize(document);
    var visibleText = document.select("HEAD,P,FP,LI,HD1,HD2,HD3,HD4,HD5,HD6,ENTRY").eachText();
    var summary = summarize(visibleText.isEmpty() ? java.util.List.of(document.text()) : visibleText);
    return new Result(summary.wordCount(), summary.preview(), sha256(canonical));
  }

  private static String canonicalize(Document document) {
    var builder = new StringBuilder();
    for (var child : document.childNodes()) {
      append(child, builder);
    }
    return builder.toString();
  }

  private static void append(Node node, StringBuilder builder) {
    if (node instanceof Element element) {
      builder.append('<').append(element.tagName());
      element.attributes().asList().stream()
          .sorted(java.util.Comparator.comparing(Attribute::getKey))
          .forEach(attribute -> builder.append(' ').append(attribute.getKey()).append("=\"").append(normalize(attribute.getValue())).append('"'));
      builder.append('>');
      for (var child : element.childNodes()) {
        append(child, builder);
      }
      builder.append("</").append(element.tagName()).append('>');
      return;
    }
    if (node instanceof TextNode textNode) {
      var normalized = normalize(textNode.getWholeText());
      if (!normalized.isBlank()) {
        builder.append(normalized);
      }
      return;
    }
    if (node instanceof DataNode dataNode) {
      var normalized = normalize(dataNode.getWholeData());
      if (!normalized.isBlank()) {
        builder.append(normalized);
      }
    }
  }

  private static String normalize(String value) {
    return value.replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
  }

  private static Summary summarize(Iterable<String> segments) {
    var preview = new StringBuilder();
    var wordCount = 0;
    var truncated = false;

    for (var segment : segments) {
      var normalized = normalize(segment);
      if (normalized.isBlank()) {
        continue;
      }

      wordCount += countWords(normalized);
      if (truncated) {
        continue;
      }

      var chunk = preview.isEmpty() ? normalized : " " + normalized;
      var remaining = PREVIEW_CONTENT_LENGTH - preview.length();
      if (remaining <= 0) {
        truncated = true;
        continue;
      }
      if (chunk.length() <= remaining) {
        preview.append(chunk);
        continue;
      }
      preview.append(chunk, 0, remaining);
      truncated = true;
    }

    var previewText = preview.toString().trim();
    if (truncated && !previewText.isEmpty()) {
      previewText += "...";
    }
    return new Summary(wordCount, previewText);
  }

  private static int countWords(String value) {
    var count = 0;
    var insideWord = false;
    for (var index = 0; index < value.length(); index += 1) {
      if (Character.isWhitespace(value.charAt(index))) {
        insideWord = false;
        continue;
      }
      if (!insideWord) {
        count += 1;
        insideWord = true;
      }
    }
    return count;
  }

  static String sha256(String value) {
    try {
      var digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      var builder = new StringBuilder();
      for (var b : digest) {
        builder.append(String.format("%02x", b));
      }
      return builder.toString();
    } catch (NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }

  record Summary(int wordCount, String preview) {}

  record Result(int wordCount, String preview, String checksum) {}
}
