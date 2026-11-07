package in.gov.ntro.sih.ms;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * The connection strings cloud providers actually hand out, translated to the
 * one form Spring's datasource accepts. Getting this wrong is invisible until
 * the deployed service cannot reach its database, so it is pinned here.
 */
class DatabaseUrlTest {

    @Test void jdbcUrlsAreLeftAlone() {
        assertThat(SecureMailScopeApplication.toJdbcUrl("jdbc:postgresql://localhost:5432/mailsentinel")).isNull();
    }

    @Test void neonStyleUrlBecomesJdbcAndKeepsSslmode() {
        assertThat(SecureMailScopeApplication.toJdbcUrl(
                "postgresql://sms:secret@ep-cool-name.ap-south-1.aws.neon.tech/mailsentinel?sslmode=require"))
                .isEqualTo("jdbc:postgresql://sms:secret@ep-cool-name.ap-south-1.aws.neon.tech/mailsentinel?sslmode=require");
    }

    @Test void libpqSchemeIsNormalisedAndChannelBindingDropped() {
        assertThat(SecureMailScopeApplication.toJdbcUrl(
                "postgres://u:p@host/db?sslmode=require&channel_binding=require"))
                .isEqualTo("jdbc:postgresql://u:p@host/db?sslmode=require");
        assertThat(SecureMailScopeApplication.toJdbcUrl(
                "postgresql://u:p@host/db?channel_binding=require"))
                .isEqualTo("jdbc:postgresql://u:p@host/db");
    }

    @Test void unrelatedUrlsAndBlanksAreIgnored() {
        assertThat(SecureMailScopeApplication.toJdbcUrl("jdbc:h2:file:./data/smsdb")).isNull();
        assertThat(SecureMailScopeApplication.toJdbcUrl("mysql://u:p@host/db")).isNull();
        assertThat(SecureMailScopeApplication.toJdbcUrl(null)).isNull();
        assertThat(SecureMailScopeApplication.toJdbcUrl("   ")).isNull();
    }
}
