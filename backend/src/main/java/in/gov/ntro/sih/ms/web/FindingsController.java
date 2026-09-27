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

        String newStatus = body.get("status");
        if (newStatus == null || newStatus.isBlank()) {
            return ResponseEntity.badRequest().body("status field required");
        }

        String username = auth != null ? auth.getName() : "system";

        FindingsStatus fs = statusRepo
                .findByCaptureIdAndStreamId(captureId, streamId)
                .orElseGet(() -> {
                    FindingsStatus n = new FindingsStatus();
                    n.setCaptureId(captureId);
                    n.setStreamId(streamId);
                    return n;
                });

        fs.setStatus(newStatus);
        fs.setUpdatedBy(username);
        fs.setUpdatedAt(Instant.now());
        if ("ESCALATED".equals(newStatus) && fs.getEscalatedAt() == null) {
            fs.setEscalatedAt(Instant.now());
        }

        statusRepo.save(fs);

        // Auto-log the status change in custody log
        custodyRepo.save(new CustodyLog(
                captureId, streamId,
                "STATUS_CHANGED_TO_" + newStatus,
                username,
                "Status updated to " + newStatus
        ));

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
