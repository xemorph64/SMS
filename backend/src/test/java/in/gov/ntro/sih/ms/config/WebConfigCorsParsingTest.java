package in.gov.ntro.sih.ms.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

class WebConfigCorsParsingTest {

    @Test
    void blankFallsBackToDevServerDefaults() {
        assertThat(WebConfig.parse(null))
                .containsExactly("http://localhost:5173", "http://127.0.0.1:5173");
        assertThat(WebConfig.parse("   "))
                .containsExactly("http://localhost:5173", "http://127.0.0.1:5173");
    }

    @Test
    void consolePasteManglingIsRepaired() {
        assertThat(WebConfig.parse("\"https://sms-x.vercel.app\""))
                .containsExactly("https://sms-x.vercel.app");
        assertThat(WebConfig.parse("https://sms-x.vercel.app/"))
                .containsExactly("https://sms-x.vercel.app");
        assertThat(WebConfig.parse("`https://sms-\u200Bx.vercel.app\u00A0`"))
                .containsExactly("https://sms-x.vercel.app");
    }

    @Test
    void multipleEntriesSplitTrimmedAndFiltered() {
        assertThat(WebConfig.parse("https://a.vercel.app, https://*.vercel.app ,"))
                .containsExactly("https://a.vercel.app", "https://*.vercel.app");
    }

    @Test
    void repairedValuesMatchAsRealSpringOriginPatterns() {
        for (String configured : new String[] {
                "https://sms-986jp6b9g-xemorph64s-projects.vercel.app",
                "https://*.vercel.app" }) {
            CorsConfiguration cors = new CorsConfiguration();
            // Quote the value the way a console paste does — the whole chain
            // (parse, then Spring's own pattern matcher) must still allow it.
            cors.setAllowedOriginPatterns(Arrays.asList(WebConfig.parse("\"" + configured + "/\"")));
            assertThat(cors.checkOrigin("https://sms-986jp6b9g-xemorph64s-projects.vercel.app"))
                    .as("pattern %s should match the live Vercel origin", configured)
                    .isNotNull();
        }
    }
}
