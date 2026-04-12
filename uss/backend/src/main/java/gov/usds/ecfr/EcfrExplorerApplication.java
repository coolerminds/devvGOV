package gov.usds.ecfr;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class EcfrExplorerApplication {
  public static void main(String[] args) {
    SpringApplication.run(EcfrExplorerApplication.class, args);
  }

  @Bean
  ApplicationRunner bootstrapImporter(
      EcfrRepository repository, ImportService importService, @Value("${app.bootstrap-import:true}") boolean bootstrapImport) {
    return args -> {
      if (bootstrapImport && !repository.hasAgencies()) {
        importService.importAll();
      }
    };
  }
}
