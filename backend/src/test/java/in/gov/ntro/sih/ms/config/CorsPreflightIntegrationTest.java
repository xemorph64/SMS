package in.gov.ntro.sih.ms.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

/**
 * Browser preflight against the real servlet container, deliberately with a
 * mangled configured value (quotes, trailing slash) like a platform console
 * paste produces. The preflight carries no Authorization header by design, so
 * it must succeed ahead of the {@code /api/** authenticated()} rule — an MVC
 * CorsRegistry mapping cannot make that promise, an ordered CorsFilter can.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ms.cors.allowed-origins=\"https://sms-986jp6b9g-xemorph64s-projects.vercel.app/\"")
@ActiveProfiles("test")
class CorsPreflightIntegrationTest {

    private static final String VERCEL_ORIGIN =
            "https://sms-986jp6b9g-xemorph64s-projects.vercel.app";

    @Autowired private TestRestTemplate rest;

    private ResponseEntity<String> preflight(String origin) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.ORIGIN, origin);
        headers.set(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET");
        headers.set(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization");
        return rest.exchange("/api/incidents", HttpMethod.OPTIONS,
                new org.springframework.http.HttpEntity<>(null, headers), String.class);
    }

    @Test
    void configuredOriginPassesPreflightWithoutCredentials() {
        ResponseEntity<String> response = preflight(VERCEL_ORIGIN);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getAccessControlAllowOrigin()).isEqualTo(VERCEL_ORIGIN);
        assertThat(response.getHeaders().getAccessControlAllowMethods()).contains(HttpMethod.GET);
    }

    @Test
    void unknownOriginIsRejected() {
        assertThat(preflight("https://evil.example.com").getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }
}
