package gov.usds.ecfr;

import gov.usds.ecfr.EcfrClient.EcfrAgency;
import gov.usds.ecfr.EcfrClient.VersionEntry;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
class ImportService {
  private static final Logger log = LoggerFactory.getLogger(ImportService.class);

  private final EcfrClient client;
  private final EcfrRepository repository;

  ImportService(EcfrClient client, EcfrRepository repository) {
    this.client = client;
    this.repository = repository;
  }

  ImportSummary importAll() {
    return importAgencies(client.agencies(), true);
  }

  List<AgencyCatalogEntry> availableAgencies() {
    var imported = repository.findAgencySlugs();
    return client.agencies().stream()
        .map(
            agency ->
                new AgencyCatalogEntry(
                    agency.slug(),
                    agency.displayName() == null ? agency.name() : agency.displayName(),
                    agency.shortName(),
                    imported.contains(agency.slug())))
        .toList();
  }

  ImportSummary importSelected(List<String> agencySlugs) {
    var requested = new LinkedHashSet<>(agencySlugs == null ? List.<String>of() : agencySlugs);
    if (requested.isEmpty()) {
      throw new IllegalArgumentException("No agencies were selected");
    }

    var selected = client.agencies().stream().filter(agency -> requested.contains(agency.slug())).toList();
    if (selected.size() != requested.size()) {
      var found = selected.stream().map(EcfrAgency::slug).collect(java.util.stream.Collectors.toSet());
      var missing = requested.stream().filter(slug -> !found.contains(slug)).toList();
      throw new IllegalArgumentException("Unknown agencies: " + String.join(", ", missing));
    }

    return importAgencies(selected, false);
  }

  private ImportSummary importAgencies(List<EcfrAgency> agenciesToImport, boolean replaceAll) {
    var titleDates = client.titleDates();
    var viewStates = repository.loadViewStates();
    var topicCache = new HashMap<String, TopicSnapshot>();
    var agencyRows = new ArrayList<EcfrRepository.AgencyRow>();
    var topicRows = new ArrayList<EcfrRepository.AgencyTopicRow>();
    var monthRows = new ArrayList<EcfrRepository.AgencyChangeRow>();
    var failures = 0;

    for (var agency : agenciesToImport) {
      var refs = flattenRefs(agency);
      var history = new HashMap<LocalDate, MonthlyCount>();
      var checksums = new ArrayList<String>();
      var latestAmendedOn = (LocalDate) null;
      var wordCount = 0;

      for (var ref : refs.values()) {
        TopicSnapshot snapshot;
        try {
          snapshot = topicCache.computeIfAbsent(ref.key(), key -> loadTopicSnapshot(ref, titleDates));
        } catch (RuntimeException exception) {
          failures++;
          log.warn("Skipping topic {} for agency {} because import failed", ref.key(), agency.slug(), exception);
          continue;
        }
        var state = viewStates.getOrDefault(agency.slug() + "|" + ref.key(), new ViewState(0, null));
        wordCount += snapshot.wordCount();
        checksums.add(ref.key() + ":" + snapshot.checksum());
        if (snapshot.latestAmendedOn() != null && (latestAmendedOn == null || snapshot.latestAmendedOn().isAfter(latestAmendedOn))) {
          latestAmendedOn = snapshot.latestAmendedOn();
        }
        snapshot.history().forEach((month, count) -> history.merge(month, count, MonthlyCount::add));
        topicRows.add(
            new EcfrRepository.AgencyTopicRow(
                agency.slug(),
                ref.key(),
                ref,
                snapshot.wordCount(),
                snapshot.checksum(),
                snapshot.rawXml(),
                snapshot.previewText(),
                state.viewCount(),
                state.lastViewedAt()));
      }

      var checksum = XmlMetrics.sha256(String.join("\n", checksums.stream().sorted().toList()));
      agencyRows.add(
          new EcfrRepository.AgencyRow(
              agency.slug(),
              agency.displayName() == null ? agency.name() : agency.displayName(),
              agency.shortName(),
              wordCount,
              checksum,
              topicRows.stream().filter(topic -> topic.agencySlug().equals(agency.slug())).map(EcfrRepository.AgencyTopicRow::topicKey).distinct().toList().size(),
              latestAmendedOn));
      history.entrySet().stream()
          .sorted(Map.Entry.comparingByKey())
          .forEach(
              entry ->
                  monthRows.add(
                      new EcfrRepository.AgencyChangeRow(
                          agency.slug(), entry.getKey(), entry.getValue().amendmentCount(), entry.getValue().removalCount())));
    }

    if (replaceAll) {
      repository.replaceAll(agencyRows, topicRows, monthRows);
    } else {
      repository.replaceAgencies(agencyRows, topicRows, monthRows);
    }
    log.info("eCFR import completed: {} agencies, {} topics, {} failures", agencyRows.size(), topicRows.size(), failures);
    return new ImportSummary(agencyRows.size(), topicRows.size(), failures);
  }

  static Map<LocalDate, MonthlyCount> aggregateHistory(List<VersionEntry> versions) {
    var history = new HashMap<LocalDate, MonthlyCount>();
    for (var entry : versions) {
      if (entry.amendmentDate() == null) {
        continue;
      }
      var month = entry.amendmentDate().withDayOfMonth(1);
      var amendmentCount = entry.substantive() ? 1 : 0;
      var removalCount = entry.removed() ? 1 : 0;
      if (amendmentCount == 0 && removalCount == 0) {
        continue;
      }
      history.merge(month, new MonthlyCount(amendmentCount, removalCount), MonthlyCount::add);
    }
    return history;
  }

  private TopicSnapshot loadTopicSnapshot(TopicRef ref, Map<Integer, LocalDate> titleDates) {
    var date = titleDates.get(ref.title());
    if (date == null) {
      throw new IllegalStateException("Missing current date for title " + ref.title());
    }
    var rawXml = client.currentXml(ref, date);
    var metrics = XmlMetrics.analyze(rawXml);
    var versions = client.versions(ref);
    var latestAmendedOn =
        versions.stream().map(VersionEntry::amendmentDate).filter(java.util.Objects::nonNull).max(LocalDate::compareTo).orElse(null);
    return new TopicSnapshot(rawXml, metrics.preview(), metrics.checksum(), metrics.wordCount(), latestAmendedOn, aggregateHistory(versions));
  }

  private LinkedHashMap<String, TopicRef> flattenRefs(EcfrAgency agency) {
    var refs = new LinkedHashMap<String, TopicRef>();
    addRefs(refs, agency.cfrReferences());
    for (var child : agency.children() == null ? List.<EcfrAgency>of() : agency.children()) {
      addRefs(refs, child.cfrReferences());
    }
    return refs;
  }

  private void addRefs(Map<String, TopicRef> refs, List<TopicRef> candidates) {
    for (var ref : candidates == null ? List.<TopicRef>of() : candidates) {
      refs.putIfAbsent(ref.key(), ref);
    }
  }

  record TopicSnapshot(
      String rawXml, String previewText, String checksum, int wordCount, LocalDate latestAmendedOn, Map<LocalDate, MonthlyCount> history) {}
}
