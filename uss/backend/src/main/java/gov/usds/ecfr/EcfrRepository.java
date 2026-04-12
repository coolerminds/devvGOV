package gov.usds.ecfr;

import java.sql.Date;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
class EcfrRepository {
  private final JdbcClient jdbc;

  EcfrRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  boolean hasAgencies() {
    return jdbc.sql("select count(*) from agencies").query(Integer.class).single() > 0;
  }

  Map<String, ViewState> loadViewStates() {
    var states = new HashMap<String, ViewState>();
    jdbc.sql("select agency_slug, topic_key, view_count, last_viewed_at from agency_topics")
        .query(
            rs -> {
              states.put(
                  rs.getString("agency_slug") + "|" + rs.getString("topic_key"),
                  new ViewState(rs.getInt("view_count"), rs.getTimestamp("last_viewed_at") == null ? null : rs.getTimestamp("last_viewed_at").toLocalDateTime()));
            });
    return states;
  }

  Set<String> findAgencySlugs() {
    return jdbc.sql("select slug from agencies").query(String.class).set();
  }

  @Transactional
  void replaceAll(List<AgencyRow> agencies, List<AgencyTopicRow> topics, List<AgencyChangeRow> months) {
    jdbc.sql("delete from agency_change_months").update();
    jdbc.sql("delete from agency_topics").update();
    jdbc.sql("delete from agencies").update();
    insertAgencies(agencies);
    insertTopics(topics);
    insertMonths(months);
  }

  @Transactional
  void replaceAgencies(List<AgencyRow> agencies, List<AgencyTopicRow> topics, List<AgencyChangeRow> months) {
    for (var agency : agencies) {
      jdbc.sql("delete from agencies where slug = ?").param(agency.slug()).update();
    }
    insertAgencies(agencies);
    insertTopics(topics);
    insertMonths(months);
  }

  private void insertAgencies(List<AgencyRow> agencies) {
    for (var agency : agencies) {
      jdbc.sql("insert into agencies (slug, name, short_name, word_count, checksum, topic_count, latest_amended_on) values (?, ?, ?, ?, ?, ?, ?)")
          .params(agency.slug(), agency.name(), agency.shortName(), agency.wordCount(), agency.checksum(), agency.topicCount(), agency.latestAmendedOn() == null ? null : Date.valueOf(agency.latestAmendedOn()))
          .update();
    }
  }

  private void insertTopics(List<AgencyTopicRow> topics) {
    for (var topic : topics) {
      jdbc.sql(
              "insert into agency_topics (agency_slug, topic_key, title, chapter, subtitle, subchapter, part, word_count, checksum, raw_xml, preview_text, view_count, last_viewed_at) "
                  + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .params(
              topic.agencySlug(),
              topic.topicKey(),
              topic.ref().title(),
              topic.ref().chapter(),
              topic.ref().subtitle(),
              topic.ref().subchapter(),
              topic.ref().part(),
              topic.wordCount(),
              topic.checksum(),
              topic.rawXml(),
              topic.previewText(),
              topic.viewCount(),
              topic.lastViewedAt())
          .update();
    }
  }

  private void insertMonths(List<AgencyChangeRow> months) {
    for (var month : months) {
      jdbc.sql("insert into agency_change_months (agency_slug, month_start, amendment_count, removal_count) values (?, ?, ?, ?)")
          .params(month.agencySlug(), Date.valueOf(month.month()), month.amendmentCount(), month.removalCount())
          .update();
    }
  }

  List<AgencySummary> findAgencies() {
    return jdbc.sql("select slug, name, word_count, checksum, topic_count, latest_amended_on from agencies order by word_count desc, name")
        .query(
            (rs, rowNum) ->
                new AgencySummary(
                    rs.getString("slug"),
                    rs.getString("name"),
                    rs.getInt("word_count"),
                    rs.getString("checksum"),
                    rs.getInt("topic_count"),
                    rs.getDate("latest_amended_on") == null ? null : rs.getDate("latest_amended_on").toLocalDate()))
            .list();
  }

  List<AgencyHistorySeries> findAgencyHistoryOverview() {
    var agencies = findAgencies();
    var histories = new LinkedHashMap<String, List<AgencyHistoryMonth>>();
    for (var agency : agencies) {
      histories.put(agency.slug(), new java.util.ArrayList<>());
    }

    jdbc.sql("select agency_slug, month_start, amendment_count, removal_count from agency_change_months order by agency_slug, month_start")
        .query(
            (RowCallbackHandler)
            rs ->
                histories
                    .computeIfAbsent(rs.getString("agency_slug"), ignored -> new java.util.ArrayList<>())
                    .add(
                        new AgencyHistoryMonth(
                            rs.getDate("month_start").toLocalDate(),
                            rs.getInt("amendment_count"),
                            rs.getInt("removal_count"))));

    return agencies.stream()
        .map(agency -> new AgencyHistorySeries(agency, histories.getOrDefault(agency.slug(), List.of())))
        .toList();
  }

  AgencyDetail findAgency(String slug) {
    var agency =
        jdbc.sql("select slug, name, word_count, checksum, topic_count, latest_amended_on from agencies where slug = ?")
            .param(slug)
            .query(
                (rs, rowNum) ->
                    new AgencySummary(
                        rs.getString("slug"),
                        rs.getString("name"),
                        rs.getInt("word_count"),
                        rs.getString("checksum"),
                        rs.getInt("topic_count"),
                        rs.getDate("latest_amended_on") == null ? null : rs.getDate("latest_amended_on").toLocalDate()))
            .optional()
            .orElse(null);
    if (agency == null) {
      return null;
    }
    var history =
        jdbc.sql("select month_start, amendment_count, removal_count from agency_change_months where agency_slug = ? order by month_start")
            .param(slug)
            .query(
                (rs, rowNum) ->
                    new AgencyHistoryMonth(
                        rs.getDate("month_start").toLocalDate(), rs.getInt("amendment_count"), rs.getInt("removal_count")))
            .list();
    var topics =
        jdbc.sql(
                "select id, title, chapter, subtitle, subchapter, part, word_count, checksum, view_count, preview_text "
                    + "from agency_topics where agency_slug = ? order by view_count desc, word_count desc, topic_key")
            .param(slug)
            .query(
                (rs, rowNum) ->
                    new AgencyTopic(
                        rs.getLong("id"),
                        rs.getInt("title"),
                        rs.getString("chapter"),
                        rs.getString("subtitle"),
                        rs.getString("subchapter"),
                        rs.getString("part"),
                        rs.getInt("word_count"),
                        rs.getString("checksum"),
                        rs.getInt("view_count"),
                        rs.getString("preview_text")))
            .list();
    return new AgencyDetail(agency, history, topics);
  }

  int incrementTopicView(long id) {
    var updated =
        jdbc.sql("update agency_topics set view_count = view_count + 1, last_viewed_at = current_timestamp where id = ?")
            .param(id)
            .update();
    if (updated == 0) {
      throw new IllegalArgumentException("Topic not found: " + id);
    }
    return jdbc.sql("select view_count from agency_topics where id = ?").param(id).query(Integer.class).single();
  }

  record AgencyRow(String slug, String name, String shortName, int wordCount, String checksum, int topicCount, java.time.LocalDate latestAmendedOn) {}

  record AgencyTopicRow(
      String agencySlug,
      String topicKey,
      TopicRef ref,
      int wordCount,
      String checksum,
      String rawXml,
      String previewText,
      int viewCount,
      LocalDateTime lastViewedAt) {}

  record AgencyChangeRow(String agencySlug, java.time.LocalDate month, int amendmentCount, int removalCount) {}
}
