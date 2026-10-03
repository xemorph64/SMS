package in.gov.ntro.sih.ms.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * Browser preflight against the real servlet container, deliberately with a
 * mangled configured value (quotes, trailing slash) like a platform console
 * paste produces. The preflight carries no Authorization header by design, so
 * it must succeed ahead of the {@code /api/** authenticated()} rule — an MVC
 * CorsRegistry mapping cannot make that promise, an ordered CorsFilter can.
 *
 * <p>Uses {@link HttpClient} rather than TestRestTemplate on purpose: the
 * {@code HttpURLConnection} underneath TestRestTemplate treats
 * {@code Access-Control-Request-*} as restricted headers and silently drops
 * them, which turns the preflight into an ordinary OPTIONS and defeats the
 * very thing this test checks.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "ms.cors.allowed-origins=\"https://sms-986jp6b9g-xemorph64s-projects.vercel.app/\"",
                // Boot on its own in-memory database with its own queue switch.
                // The suite's application-test.yml disables the worker via
                // sms.jobs.enabled, but the bean is gated on ms.jobs.enabled,
                // so a second context would otherwise start a live AnalysisQueue:
                // its ApplicationReadyEvent recoverInterrupted() and its 1s PENDING
                // poller race against InvestigationFlowTest on the shared database.
                "ms.jobs.enabled=false",
                "spring.datasource.url=jdbc:h2:mem:corstest;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
        })
@ActiveProfiles("test")
class CorsPreflightIntegrationTest {

    private static final String VERCEL_ORIGIN =
            "https://sms-986jp6b9g-xemorph64s-projects.vercel.app";

    @LocalServerPort private int port;

    private HttpResponse<String> preflight(String origin) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create("http://localhost:" + port + "/api/incidents"))
                .header("Origin", origin)
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "authorization")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .build();
        return HttpClient.newHttpClient()
                .send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void configuredOriginPassesPreflightWithoutCredentials() throws Exception {
        HttpResponse<String> response = preflight(VERCEL_ORIGIN);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin"))
                .contains(VERCEL_ORIGIN);
        String allowMethods = response.headers()
                .firstValue("Access-Control-Allow-Methods").orElse("");
        assertThat(allowMethods).contains("GET");
    }

    @Test
    void unknownOriginIsRejected() throws Exception {
        assertThat(preflight("https://evil.example.com").statusCode())
                .isEqualTo(403);
    }
}
