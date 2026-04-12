package gov.usds.ecfr;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import gov.usds.ecfr.EcfrClient.EcfrAgency;
import gov.usds.ecfr.EcfrClient.VersionEntry;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
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

  @MockBean private EcfrClient client;

  @BeforeEach
  void setUp() {
    var duplicateRef = new TopicRef(7, "I", null, null, null);
    var childRef = new TopicRef(7, "II", null, null, null);
    Mockito.when(client.agencies())
        .thenReturn(
            List.of(
                new EcfrAgency(
                    "Department of Agriculture",
                    "USDA",
                    "Department of Agriculture",
                    "agriculture-department",
                    List.of(new EcfrAgency("AMS", "AMS", "AMS", "ams", List.of(), List.of(duplicateRef, childRef))),
                    List.of(duplicateRef))));
    Mockito.when(client.titleDates()).thenReturn(Map.of(7, LocalDate.of(2026, 4, 9)));
    Mockito.when(client.currentXml(duplicateRef, LocalDate.of(2026, 4, 9))).thenReturn("<DIV5><P>Alpha beta gamma.</P></DIV5>");
    Mockito.when(client.currentXml(childRef, LocalDate.of(2026, 4, 9))).thenReturn("<DIV5><P>Delta epsilon zeta eta.</P></DIV5>");
    Mockito.when(client.versions(duplicateRef))
        .thenReturn(List.of(new VersionEntry(LocalDate.of(2026, 4, 1), true, false), new VersionEntry(LocalDate.of(2026, 4, 5), false, true)));
    Mockito.when(client.versions(childRef)).thenReturn(List.of(new VersionEntry(LocalDate.of(2026, 3, 1), true, false)));
    importService.importAll();
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
        .perform(get("/api/agencies/agriculture-department"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.agency.name", is("Department of Agriculture")))
        .andExpect(jsonPath("$.history", hasSize(2)))
        .andExpect(jsonPath("$.topics", hasSize(2)));

    var topicId = repository.findAgency("agriculture-department").topics().get(0).id();
    mockMvc.perform(post("/api/topics/{id}/view", topicId)).andExpect(status().isOk()).andExpect(jsonPath("$.viewCount", is(1)));
  }
}
