package gov.usds.ecfr;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

record TopicRef(int title, String chapter, String subtitle, String subchapter, String part) {
  String key() {
    return "t=%s|c=%s|st=%s|sc=%s|p=%s".formatted(title, text(chapter), text(subtitle), text(subchapter), text(part));
  }

  private String text(String value) {
    return value == null ? "" : value;
  }
}

record MonthlyCount(int amendmentCount, int removalCount) {
  MonthlyCount add(MonthlyCount other) {
    return new MonthlyCount(amendmentCount + other.amendmentCount, removalCount + other.removalCount);
  }
}

record AgencySummary(String slug, String name, int wordCount, String checksum, int topicCount, LocalDate latestAmendedOn) {}

record AgencyTopic(
    long id,
    int title,
    String chapter,
    String subtitle,
    String subchapter,
    String part,
    int wordCount,
    String checksum,
    int viewCount,
    String previewText) {}

record AgencyHistoryMonth(LocalDate month, int amendmentCount, int removalCount) {}

record AgencyHistorySeries(AgencySummary agency, List<AgencyHistoryMonth> history) {}

record AgencyDetail(AgencySummary agency, List<AgencyHistoryMonth> history, List<AgencyTopic> topics) {}

record AgencyCatalogEntry(String slug, String name, String shortName, boolean imported) {}

record AgencyImportRequest(List<String> slugs) {}

record ViewState(int viewCount, LocalDateTime lastViewedAt) {}

record ImportSummary(int agencies, int topics, int failures) {}
