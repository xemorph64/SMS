package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.DfTrack;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface DfTrackRepository extends JpaRepository<DfTrack, Long> {
    Optional<DfTrack> findByIncidentId(Long incidentId);
}
