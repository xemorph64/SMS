package in.gov.ntro.sih.ms.web;

import in.gov.ntro.sih.ms.domain.CustodyLog;
import in.gov.ntro.sih.ms.domain.FindingsStatus;
import in.gov.ntro.sih.ms.repo.CustodyLogRepository;
import in.gov.ntro.sih.ms.repo.FindingsStatusRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/findings")
public class FindingsController {

    private final FindingsStatusRepository statusRepo;
    private final CustodyLogRepository custodyRepo;

    public FindingsController(FindingsStatusRepository statusRepo, CustodyLogRepository custodyRepo) {
        this.statusRepo = statusRepo;
        this.custodyRepo = custodyRepo;
    }

    // ─── GET all statuses for a capture ──────────────────────────────────────
    @GetMapping("/{captureId}")
    public List<FindingsStatus> getByCaptureId(@PathVariable Long captureId) {
        return statusRepo.findByCaptureId(captureId);
    }

    // ─── GET all statuses globally (for Auditor / Forensics dashboards) ───────
    @GetMapping
    public List<FindingsStatus> getAll() {
        return statusRepo.findAll();
    }

    // ─── PATCH update a status ────────────────────────────────────────────────
    @PatchMapping("/{captureId}/{streamId}")
    public ResponseEntity<?> updateStatus(
            @PathVariable Long captureId,
            @PathVariable String streamId,
            @RequestBody Map<String, String> body,
            Authentication auth) {

        String newIrStatus = body.get("irStatus");
        String newForensicsStatus = body.get("forensicsStatus");

        if (newIrStatus == null && newForensicsStatus == null) {
            return ResponseEntity.badRequest().body("irStatus or forensicsStatus required");
        }

        String username = auth != null ? auth.getName() : "system";

        FindingsStatus fs = statusRepo
                .findByCaptureIdAndStreamId(captureId, streamId)
                .orElseGet(() -> {
                    FindingsStatus n = new FindingsStatus();
                    n.setCaptureId(captureId);
                    n.setStreamId(streamId);
                    n.setNoticedAt(Instant.now());
                    return n;
                });

        if (newIrStatus != null) {
            fs.setIrStatus(newIrStatus);
            // Auto-log the status change in custody log
            custodyRepo.save(new CustodyLog(captureId, streamId, "IR_STATUS_" + newIrStatus, username, "IR Status updated to " + newIrStatus));
        }
        
        if (newForensicsStatus != null) {
            fs.setForensicsStatus(newForensicsStatus);
            // Auto-log the status change in custody log
            custodyRepo.save(new CustodyLog(captureId, streamId, "FORENSICS_STATUS_" + newForensicsStatus, username, "Forensics Status updated to " + newForensicsStatus));
        }

        fs.setUpdatedBy(username);
        fs.setUpdatedAt(Instant.now());
        
        if (fs.getNoticedAt() == null) {
            fs.setNoticedAt(Instant.now());
        }

        statusRepo.save(fs);
        return ResponseEntity.ok(fs);
    }

    // ─── POST custody log entry (Forensics Analyst evidence access) ───────────
    @PostMapping("/{captureId}/{streamId}/custody")
    public ResponseEntity<?> logCustody(
            @PathVariable Long captureId,
            @PathVariable String streamId,
            @RequestBody Map<String, String> body,
            Authentication auth) {

        String action = body.getOrDefault("action", "EVIDENCE_VIEWED");
        String notes  = body.getOrDefault("notes", "");
        String username = auth != null ? auth.getName() : "unknown";

        CustodyLog entry = new CustodyLog(captureId, streamId, action, username, notes);
        custodyRepo.save(entry);
        return ResponseEntity.ok(entry);
    }

    // ─── GET custody log for a specific session ───────────────────────────────
    @GetMapping("/{captureId}/{streamId}/custody")
    public List<CustodyLog> getCustodyLog(
            @PathVariable Long captureId,
            @PathVariable String streamId) {
        return custodyRepo.findByCaptureIdAndStreamIdOrderByPerformedAtAsc(captureId, streamId);
    }
}
