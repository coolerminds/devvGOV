package gov.usds.ecfr;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import gov.usds.ecfr.EcfrClient.EcfrAgency;
import gov.usds.ecfr.EcfrClient.VersionEntry;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "app.bootstrap-import=false",
      "spring.datasource.url=jdbc:h2:mem:ecfr;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
      "spring.datasource.driverClassName=org.h2.Driver",
      "spring.datasource.username=sa",
      "spring.datasource.password="
    })
@AutoConfigureMockMvc
class EcfrControllerIntegrationTest {
  @Autowired private MockMvc mockMvc;
  @Autowired private ImportService importService;
  @Autowired private EcfrRepository repository;
  @Autowired private TestEcfrClient client;

  @TestConfiguration
  static class TestConfig {
    @Bean
    @Primary
    TestEcfrClient client() {
      return new TestEcfrClient(new ObjectMapper());
    }
  }

  static class TestEcfrClient extends EcfrClient {
    private List<EcfrAgency> agencies = List.of();
    private Map<Integer, LocalDate> titleDates = Map.of();
    private Map<String, String> currentXml = Map.of();
    private Map<String, List<VersionEntry>> versions = Map.of();
    private Map<String, RuntimeException> currentXmlFailures = Map.of();
    private RuntimeException agenciesFailure;
    private RuntimeException titleDatesFailure;

    TestEcfrClient(ObjectMapper objectMapper) {
      super(objectMapper);
    }

    void configure(
        List<EcfrAgency> agencies,
        Map<Integer, LocalDate> titleDates,
        Map<String, String> currentXml,
        Map<String, List<VersionEntry>> versions) {
      this.agencies = agencies;
      this.titleDates = titleDates;
      this.currentXml = currentXml;
      this.versions = versions;
      this.currentXmlFailures = Map.of();
      this.agenciesFailure = null;
      this.titleDatesFailure = null;
    }

    void failCurrentXml(String topicKey, RuntimeException exception) {
      this.currentXmlFailures = Map.of(topicKey, exception);
    }

    void failAgencies(RuntimeException exception) {
      this.agenciesFailure = exception;
    }

    void failTitleDates(RuntimeException exception) {
      this.titleDatesFailure = exception;
    }

    @Override
    List<EcfrAgency> agencies() {
      if (agenciesFailure != null) {
        throw agenciesFailure;
      }
      return agencies;
    }

    @Override
    Map<Integer, LocalDate> titleDates() {
      if (titleDatesFailure != null) {
        throw titleDatesFailure;
      }
      return titleDates;
    }

    @Override
    String currentXml(TopicRef ref, LocalDate onDate) {
      var failure = currentXmlFailures.get(ref.key());
      if (failure != null) {
        throw failure;
      }
      return currentXml.get(ref.key());
    }

    @Override
    List<VersionEntry> versions(TopicRef ref) {
      return versions.getOrDefault(ref.key(), List.of());
    }
  }

  @BeforeEach
  void setUp() {
    repository.replaceAll(List.of(), List.of(), List.of());
    var duplicateRef = new TopicRef(7, "I", null, null, null);
    var childRef = new TopicRef(7, "II", null, null, null);
    var epaRef = new TopicRef(40, "I", null, null, null);
    client.configure(
        List.of(
            new EcfrAgency(
                "Department of Agriculture",
                "USDA",
                "Department of Agriculture",
                "agriculture-department",
                List.of(new EcfrAgency("AMS", "AMS", "AMS", "ams", List.of(), List.of(duplicateRef, childRef))),
                List.of(duplicateRef)),
            new EcfrAgency(
                "Environmental Protection Agency",
                "EPA",
                "Environmental Protection Agency",
                "environmental-protection-agency",
                List.of(),
                List.of(epaRef))),
        Map.of(7, LocalDate.of(2026, 4, 9), 40, LocalDate.of(2026, 4, 8)),
        Map.of(
            duplicateRef.key(), "<DIV5><P>Alpha beta gamma.</P></DIV5>",
            childRef.key(), "<DIV5><P>Delta epsilon zeta eta.</P></DIV5>",
            epaRef.key(), "<DIV5><P>Clean air enforcement language.</P></DIV5>"),
        Map.of(
            duplicateRef.key(), List.of(new VersionEntry(LocalDate.of(2026, 4, 1), true, false), new VersionEntry(LocalDate.of(2026, 4, 5), false, true)),
            childRef.key(), List.of(new VersionEntry(LocalDate.of(2026, 3, 1), true, false)),
            epaRef.key(), List.of(new VersionEntry(LocalDate.of(2026, 2, 1), true, false), new VersionEntry(LocalDate.of(2026, 4, 1), true, true))));
    importService.importSelected(List.of("agriculture-department"));
  }

  @Test
  void importAndEndpointsUseStoredData() throws Exception {
    mockMvc
        .perform(get("/api/agencies"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].slug", is("agriculture-department")))
        .andExpect(jsonPath("$[0].topicCount", is(2)));

    mockMvc
        .perform(get("/api/overview/history"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].agency.slug", is("agriculture-department")))
        .andExpect(jsonPath("$[0].history", hasSize(2)));

    mockMvc
        .perform(get("/api/admin/agencies"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].slug", is("agriculture-department")))
        .andExpect(jsonPath("$[0].imported", is(true)))
        .andExpect(jsonPath("$[1].slug", is("environmental-protection-agency")))
        .andExpect(jsonPath("$[1].imported", is(false)));

    mockMvc
        .perform(get("/api/agencies/agriculture-department"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.agency.name", is("Department of Agriculture")))
        .andExpect(jsonPath("$.history", hasSize(2)))
        .andExpect(jsonPath("$.topics", hasSize(2)));

    var topicId = repository.findAgency("agriculture-department").topics().get(0).id();
    mockMvc.perform(post("/api/topics/{id}/view", topicId)).andExpect(status().isOk()).andExpect(jsonPath("$.viewCount", is(1)));
  }

  @Test
  void targetedImportAddsSelectedAgencyWithoutReplacingExistingOnes() throws Exception {
    mockMvc
        .perform(post("/api/admin/agencies/import").contentType("application/json").content("""
            {"slugs":["environmental-protection-agency"]}
            """))
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.agencies", is(1)))
        .andExpect(jsonPath("$.topics", is(1)));

    mockMvc
        .perform(get("/api/agencies"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)));

    mockMvc
        .perform(get("/api/agencies/environmental-protection-agency"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.agency.name", is("Environmental Protection Agency")))
        .andExpect(jsonPath("$.topics", hasSize(1)));
  }

  @Test
  void targetedImportSkipsAgenciesAlreadyInWorkspace() throws Exception {
    client.failAgencies(new IllegalStateException("catalog unavailable"));

    mockMvc
        .perform(post("/api/admin/agencies/import").contentType("application/json").content("""
            {"slugs":["agriculture-department"]}
            """))
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.agencies", is(0)))
        .andExpect(jsonPath("$.topics", is(0)))
        .andExpect(jsonPath("$.failures", is(0)));
  }

  @Test
  void targetedImportReturnsBadGatewayWhenSelectedAgencyCannotImportAnyTopics() throws Exception {
    client.failCurrentXml("t=40|c=I|st=|sc=|p=", new IllegalStateException("timed out"));

    mockMvc
        .perform(post("/api/admin/agencies/import").contentType("application/json").content("""
            {"slugs":["environmental-protection-agency"]}
            """))
        .andExpect(status().isBadGateway());

    mockMvc
        .perform(get("/api/agencies"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].slug", is("agriculture-department")));
  }

  @Test
  void availableAgenciesReturnsBadGatewayWhenCatalogLookupFails() throws Exception {
    client.failAgencies(new IllegalStateException("catalog unavailable"));

    mockMvc.perform(get("/api/admin/agencies")).andExpect(status().isBadGateway());
  }
}
