package in.gov.ntro.sih.ms.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Date;

@Component
public class JwtUtils {

    private static final Logger log = LoggerFactory.getLogger(JwtUtils.class);

    /** Keeps local development working without any setup. Deployments must set SMS_JWT_SECRET. */
    static final String DEV_SECRET =
            "MailSentinelSecretKey2026!_MailSentinelSecretKey2026!_MailSentinelSecretKey2026!";

    private final Key key;
    private final int jwtExpirationMs = 86400000; // 24h

    public JwtUtils(@Value("${ms.jwt.secret:" + DEV_SECRET + "}") String secret) {
        if (secret == null || secret.isBlank()) secret = DEV_SECRET;
        if (DEV_SECRET.equals(secret)) {
            log.warn("Using the built-in development JWT secret. Set SMS_JWT_SECRET "
                    + "(e.g. `openssl rand -base64 48`) before exposing this service.");
        }
        // HMAC-SHA256 wants exactly a 256-bit key, and a configured secret may be
        // any length. Hashing it to 32 bytes accepts short and long values alike;
        // the strength of the signature still rests on the secret's entropy.
        this.key = Keys.hmacShaKeyFor(sha256(secret));
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by every Java runtime", e);
        }
    }

    public String generateJwtToken(Authentication authentication) {
        UserDetailsImpl userPrincipal = (UserDetailsImpl) authentication.getPrincipal();
        String role = userPrincipal.getAuthorities().iterator().next().getAuthority();
        return Jwts.builder()
                .setSubject((userPrincipal.getUsername()))
                .claim("role", role)
                .setIssuedAt(new Date())
                .setExpiration(new Date((new Date()).getTime() + jwtExpirationMs))
                .signWith(key)
                .compact();
    }

    public String getUserNameFromJwtToken(String token) {
        return Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token).getBody().getSubject();
    }

    public boolean validateJwtToken(String authToken) {
        try {
            Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(authToken);
            return true;
        } catch (JwtException e) {
            return false;
        }
    }
}
