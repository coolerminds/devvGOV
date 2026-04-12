package gov.usds.ecfr;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
