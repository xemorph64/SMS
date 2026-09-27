package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.FindingsStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FindingsStatusRepository extends JpaRepository<FindingsStatus, Long> {
    Optional<FindingsStatus> findByCaptureIdAndStreamId(Long captureId, String streamId);
    List<FindingsStatus> findByStatus(String status);
    List<FindingsStatus> findByCaptureId(Long captureId);
}
