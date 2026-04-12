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
  private XmlMetrics() {}

  static Result analyze(String xml) {
    var document = Jsoup.parse(xml, "", Parser.xmlParser());
    var canonical = canonicalize(document);
    var normalized = Jsoup.parse(canonical, "", Parser.xmlParser());
    var visibleText = normalized.select("HEAD,P,FP,LI,HD1,HD2,HD3,HD4,HD5,HD6,ENTRY").eachText();
    var text = String.join(" ", visibleText.isEmpty() ? java.util.List.of(normalized.text()) : visibleText).replace('\u00A0', ' ').replaceAll("\\s+", " ").trim();
    var preview = text.length() > 360 ? text.substring(0, 357) + "..." : text;
    var wordCount = text.isBlank() ? 0 : text.split("\\s+").length;
    return new Result(wordCount, preview, sha256(canonical));
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

  record Result(int wordCount, String preview, String checksum) {}
}
