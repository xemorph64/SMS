package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.Incident;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface IncidentRepository extends JpaRepository<Incident, Long> {
    Optional<Incident> findByCaptureIdAndStreamId(Long captureId, String streamId);
    List<Incident> findByStatusOrderByIdAsc(Incident.Status status);
    List<Incident> findAllByOrderByIdAsc();
}
