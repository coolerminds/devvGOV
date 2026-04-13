package gov.usds.ecfr;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

@Component
class EcfrClient {
  private static final String BASE_URL = "https://www.ecfr.gov";
  private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);

  private final HttpClient httpClient =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NORMAL).build();
  private final ObjectMapper objectMapper;

  EcfrClient(ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;
  }

  List<EcfrAgency> agencies() {
    return getJson("/api/admin/v1/agencies.json", AgenciesResponse.class).agencies();
  }

  Map<Integer, LocalDate> titleDates() {
    var dates = new TreeMap<Integer, LocalDate>();
    for (var title : getJson("/api/versioner/v1/titles.json", TitlesResponse.class).titles()) {
      if (!title.reserved() && title.upToDateAsOf() != null) {
        dates.put(title.number(), title.upToDateAsOf());
      }
    }
    return dates;
  }

  String currentXml(TopicRef ref, LocalDate onDate) {
    return getText("/api/versioner/v1/full/%s/title-%s.xml%s".formatted(onDate, ref.title(), query(ref)));
  }

  List<VersionEntry> versions(TopicRef ref) {
    return getJson("/api/versioner/v1/versions/title-%s.json%s".formatted(ref.title(), query(ref)), VersionsResponse.class)
        .contentVersions();
  }

  private <T> T getJson(String path, Class<T> type) {
    try {
      var request =
          HttpRequest.newBuilder(URI.create(BASE_URL + path))
              .timeout(REQUEST_TIMEOUT)
              .header("Accept", "application/json")
              .GET()
              .build();
      var response = send(request, HttpResponse.BodyHandlers.ofString(), "JSON", path);
      if (response.statusCode() >= 400) {
        throw new IllegalStateException("eCFR request failed for %s with %s".formatted(path, response.statusCode()));
      }
      return objectMapper.readValue(response.body(), type);
    } catch (IOException exception) {
      throw new IllegalStateException("eCFR JSON request failed for " + path, exception);
    }
  }

  private String getText(String path) {
    var request =
        HttpRequest.newBuilder(URI.create(BASE_URL + path))
            .timeout(REQUEST_TIMEOUT)
            .header("Accept", "application/xml")
            .GET()
            .build();
    var response = send(request, HttpResponse.BodyHandlers.ofString(), "XML", path);
    if (response.statusCode() >= 400) {
      throw new IllegalStateException("eCFR request failed for %s with %s".formatted(path, response.statusCode()));
    }
    return response.body();
  }

  private <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> bodyHandler, String requestType, String path) {
    var response = httpClient.sendAsync(request, bodyHandler);
    try {
      return response.get(REQUEST_TIMEOUT.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("eCFR %s request interrupted for %s".formatted(requestType, path), exception);
    } catch (TimeoutException exception) {
      response.cancel(true);
      throw new IllegalStateException("eCFR %s request timed out for %s".formatted(requestType, path), exception);
    } catch (ExecutionException exception) {
      var cause = exception.getCause();
      if (cause instanceof HttpTimeoutException timeoutException) {
        throw new IllegalStateException("eCFR %s request timed out for %s".formatted(requestType, path), timeoutException);
      }
      if (cause instanceof RuntimeException runtimeException) {
        throw runtimeException;
      }
      if (cause instanceof Error error) {
        throw error;
      }
      throw new IllegalStateException("eCFR %s request failed for %s".formatted(requestType, path), cause);
    }
  }

  private String query(TopicRef ref) {
    var parts = new ArrayList<String>();
    add(parts, "chapter", ref.chapter());
    add(parts, "subtitle", ref.subtitle());
    add(parts, "subchapter", ref.subchapter());
    add(parts, "part", ref.part());
    return parts.isEmpty() ? "" : "?" + String.join("&", parts);
  }

  private void add(List<String> parts, String key, String value) {
    if (value != null && !value.isBlank()) {
      parts.add(URLEncoder.encode(key, StandardCharsets.UTF_8) + "=" + URLEncoder.encode(value, StandardCharsets.UTF_8));
    }
  }

  record AgenciesResponse(List<EcfrAgency> agencies) {}

  record TitlesResponse(List<TitleMeta> titles) {}

  record VersionsResponse(@JsonProperty("content_versions") List<VersionEntry> contentVersions) {}

  record EcfrAgency(
      String name,
      @JsonProperty("short_name") String shortName,
      @JsonProperty("display_name") String displayName,
      String slug,
      List<EcfrAgency> children,
      @JsonProperty("cfr_references") List<TopicRef> cfrReferences) {}

  record TitleMeta(int number, boolean reserved, @JsonProperty("up_to_date_as_of") LocalDate upToDateAsOf) {}

  record VersionEntry(
      @JsonProperty("amendment_date") LocalDate amendmentDate, boolean substantive, boolean removed) {}
}
