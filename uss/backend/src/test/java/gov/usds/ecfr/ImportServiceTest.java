package gov.usds.ecfr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import gov.usds.ecfr.EcfrClient.VersionEntry;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class ImportServiceTest {
  @Test
  void aggregateHistoryCountsSubstantiveAmendmentsAndRemovals() {
    var history =
        ImportService.aggregateHistory(
            List.of(
                new VersionEntry(LocalDate.of(2026, 4, 9), true, false),
                new VersionEntry(LocalDate.of(2026, 4, 15), false, true),
                new VersionEntry(LocalDate.of(2026, 5, 1), true, true),
                new VersionEntry(LocalDate.of(2026, 5, 3), false, false)));

    assertEquals(new MonthlyCount(1, 1), history.get(LocalDate.of(2026, 4, 1)));
    assertEquals(new MonthlyCount(1, 1), history.get(LocalDate.of(2026, 5, 1)));
  }
}

