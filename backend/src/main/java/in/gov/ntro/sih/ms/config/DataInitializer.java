package in.gov.ntro.sih.ms.config;

import in.gov.ntro.sih.ms.domain.Role;
import in.gov.ntro.sih.ms.domain.User;
import in.gov.ntro.sih.ms.repo.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DataInitializer(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) throws Exception {
        upsert("analyst",   Role.ROLE_SOC_ANALYST);
        upsert("ir",        Role.ROLE_INCIDENT_RESPONDER);
        upsert("forensics", Role.ROLE_FORENSICS_ANALYST);
        upsert("auditor",   Role.ROLE_AUDITOR);
        upsert("admin",     Role.ROLE_ADMIN);
    }

    private void upsert(String username, Role role) {
        if (!userRepository.existsByUsername(username)) {
            userRepository.save(new User(username, passwordEncoder.encode("password"), role));
        }
    }
}
