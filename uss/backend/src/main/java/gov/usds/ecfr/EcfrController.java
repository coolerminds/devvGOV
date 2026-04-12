package gov.usds.ecfr;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class EcfrController {
  private final EcfrRepository repository;
  private final ImportService importService;

  EcfrController(EcfrRepository repository, ImportService importService) {
    this.repository = repository;
    this.importService = importService;
  }

  @GetMapping("/agencies")
  List<AgencySummary> agencies() {
    return repository.findAgencies();
  }

  @GetMapping("/overview/history")
  List<AgencyHistorySeries> historyOverview() {
    return repository.findAgencyHistoryOverview();
  }

  @GetMapping("/agencies/{slug}")
  AgencyDetail agency(@PathVariable String slug) {
    var agency = repository.findAgency(slug);
    if (agency == null) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agency not found");
    }
    return agency;
  }

  @PostMapping("/topics/{id}/view")
  Map<String, Integer> topicView(@PathVariable long id) {
    try {
      return Map.of("viewCount", repository.incrementTopicView(id));
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
    }
  }

  @PostMapping("/admin/import")
  @ResponseStatus(HttpStatus.ACCEPTED)
  ImportSummary reimport() {
    try {
      return importService.importAll();
    } catch (IllegalStateException exception) {
      throw upstreamFailure("reimport eCFR data", exception);
    }
  }

  @GetMapping("/admin/agencies")
  List<AgencyCatalogEntry> availableAgencies() {
    try {
      return importService.availableAgencies();
    } catch (IllegalStateException exception) {
      throw upstreamFailure("load the eCFR agency catalog", exception);
    }
  }

  @PostMapping("/admin/agencies/import")
  @ResponseStatus(HttpStatus.ACCEPTED)
  ImportSummary importAgencies(@RequestBody AgencyImportRequest request) {
    try {
      return importService.importSelected(request == null ? List.of() : request.slugs());
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage());
    } catch (IllegalStateException exception) {
      throw upstreamFailure("import the selected agencies", exception);
    }
  }

  private ResponseStatusException upstreamFailure(String action, IllegalStateException exception) {
    return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Unable to %s right now".formatted(action), exception);
  }
}
