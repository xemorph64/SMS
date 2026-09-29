package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.IrTrack;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface IrTrackRepository extends JpaRepository<IrTrack, Long> {
    Optional<IrTrack> findByIncidentId(Long incidentId);
}
