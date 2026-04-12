package gov.usds.ecfr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class XmlMetricsTest {
  @Test
  void xmlTextAndChecksumStayStable() {
    var left = "<DIV5><HEAD>PART 1</HEAD><P>Hello world from eCFR.</P></DIV5>";
    var right = "<DIV5>\n  <HEAD>PART 1</HEAD>\n  <P>Hello   world from eCFR.</P>\n</DIV5>";
    var leftMetrics = XmlMetrics.analyze(left);
    var rightMetrics = XmlMetrics.analyze(right);

    assertEquals(6, leftMetrics.wordCount());
    assertEquals(leftMetrics.wordCount(), rightMetrics.wordCount());
    assertEquals(leftMetrics.checksum(), rightMetrics.checksum());
  }

  @Test
  void xmlPreviewStaysBoundedForLargeContent() {
    var builder = new StringBuilder("<DIV5><HEAD>PART 1</HEAD>");
    for (var index = 0; index < 2000; index += 1) {
      builder.append("<P>alpha beta gamma delta epsilon</P>");
    }
    builder.append("</DIV5>");

    var metrics = XmlMetrics.analyze(builder.toString());

    assertEquals(10002, metrics.wordCount());
    assertTrue(metrics.preview().length() <= 360);
    assertTrue(metrics.preview().endsWith("..."));
  }
}
