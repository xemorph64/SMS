package in.gov.ntro.sih.ms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * MailSentinel backend.
 *
 * <p>Deliberately thin. Every piece of cryptographic analysis — PCAP parsing,
 * TCP reassembly, TLS handshake dissection, X.509 validation, the rule engine,
 * grading and the model — lives in the Python engine under {@code engine/}.
 * This service uploads a capture, runs the engine, persists the result and
 * serves it. That split is intentional: the subtle, bug-prone logic sits where
 * it is exhaustively unit-tested, and the two halves meet across exactly one
 * JSON contract.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class MailSentinelApplication {

    public static void main(String[] args) {
        acceptConnectionStringForm();
        SpringApplication.run(MailSentinelApplication.class, args);
    }

    /**
     * Accept the connection string cloud providers hand out, not only a JDBC URL.
     *
     * <p>Neon, Render, Railway and Heroku all expose PostgreSQL as
     * {@code postgresql://user:pass@host/db} — the libpq form — while Spring's
     * datasource expects {@code jdbc:postgresql://}. Translating here, once,
     * means a deployment can paste the provider's value straight into
     * {@code SMS_DB_URL} instead of hand-editing it. A value that is already a
     * JDBC URL is left untouched, and {@code DATABASE_URL} is honoured as a
     * fallback for providers that set only that.
     *
     * <p>Setting a system property rather than the environment is deliberate:
     * system properties outrank environment variables in Spring's property
     * resolution, so the corrected value wins over the raw one.
     */
    static void acceptConnectionStringForm() {
        String url = System.getenv("SMS_DB_URL");
        if (url == null || url.isBlank()) url = System.getenv("DATABASE_URL");
        String jdbc = toJdbcUrl(url);
        if (jdbc != null) System.setProperty("SMS_DB_URL", jdbc);
    }

    /** The JDBC equivalent of a libpq URL, or null when none is needed. */
    static String toJdbcUrl(String url) {
        if (url == null || url.isBlank()) return null;
        String value = url.trim();
        if (value.startsWith("jdbc:")) return null;
        if (value.startsWith("postgres://")) {
            value = "postgresql://" + value.substring("postgres://".length());
        } else if (!value.startsWith("postgresql://")) {
            return null;
        }
        // channel_binding is a libpq option with no pgjdbc equivalent, and its
        // presence makes the driver reject the URL. sslmode is understood as-is.
        return ("jdbc:" + value)
                .replaceAll("([?&])channel_binding=[^&]*&?", "$1")
                .replaceAll("[?&]$", "");
    }
}
