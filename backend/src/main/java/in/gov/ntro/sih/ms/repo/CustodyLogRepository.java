package in.gov.ntro.sih.ms.repo;

import in.gov.ntro.sih.ms.domain.CustodyLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CustodyLogRepository extends JpaRepository<CustodyLog, Long> {
    List<CustodyLog> findByCaptureIdAndStreamIdOrderByPerformedAtAsc(Long captureId, String streamId);
    List<CustodyLog> findByCaptureIdOrderByPerformedAtAsc(Long captureId);
}
