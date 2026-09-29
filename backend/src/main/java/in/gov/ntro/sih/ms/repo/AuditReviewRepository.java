package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.AuditReview;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AuditReviewRepository extends JpaRepository<AuditReview, Long> {
    List<AuditReview> findByIncidentIdOrderByReviewedAtAsc(Long incidentId);
}
