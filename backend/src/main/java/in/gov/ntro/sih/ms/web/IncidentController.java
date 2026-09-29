package in.gov.ntro.sih.ms.web;

import in.gov.ntro.sih.ms.domain.AuditReview;
import in.gov.ntro.sih.ms.domain.CustodyLog;
import in.gov.ntro.sih.ms.domain.DfTrack;
import in.gov.ntro.sih.ms.domain.Incident;
import in.gov.ntro.sih.ms.domain.IrTrack;
import in.gov.ntro.sih.ms.repo.AuditReviewRepository;
import in.gov.ntro.sih.ms.repo.CaptureRepository;
import in.gov.ntro.sih.ms.repo.CustodyLogRepository;
import in.gov.ntro.sih.ms.repo.DfTrackRepository;
import in.gov.ntro.sih.ms.repo.IncidentRepository;
import in.gov.ntro.sih.ms.repo.IrTrackRepository;
import in.gov.ntro.sih.ms.service.IncidentService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * The incident workflow REST surface, with role-based authorization enforced
 * server-side. The SOC analyst triages, the responder and the forensic analyst
 * work their own tracks, and only the auditor passes verdicts through the
 * gate — the same separation of duties the UI shows, now also true when the
 * UI is not the thing making the request.
 */
@RestController
@RequestMapping("/api/incidents")
public class IncidentController {

    private final IncidentService workflow;
    private final IncidentRepository incidents;
    private final IrTrackRepository irTracks;
    private final DfTrackRepository dfTracks;
    private final AuditReviewRepository auditReviews;
    private final CustodyLogRepository custody;
    private final CaptureRepository captures;

    public IncidentController(IncidentService workflow, IncidentRepository incidents,
                              IrTrackRepository irTracks, DfTrackRepository dfTracks,
                              AuditReviewRepository auditReviews, CustodyLogRepository custody,
                              CaptureRepository captures) {
        this.workflow = workflow;
        this.incidents = incidents;
        this.irTracks = irTracks;
        this.dfTracks = dfTracks;
        this.auditReviews = auditReviews;
        this.custody = custody;
        this.captures = captures;
    }

    // ------------------------------------------------------------------ reads

    @GetMapping
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(@RequestParam(required = false) Incident.Status status) {
        List<Incident> rows = status == null ? incidents.findAllByOrderByIdAsc() : incidents.findByStatusOrderByIdAsc(status);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Incident i : rows) {
            out.add(summary(i, irTracks.findByIncidentId(i.getId()).orElse(null),
                    dfTracks.findByIncidentId(i.getId()).orElse(null)));
        }
        return out;
    }

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> detail(@PathVariable Long id) {
        Incident incident = require(id);
        Map<String, Object> out = summary(incident,
                irTracks.findByIncidentId(id).orElse(null),
                dfTracks.findByIncidentId(id).orElse(null));
        out.put("auditHistory", auditReviews.findByIncidentIdOrderByReviewedAtAsc(id).stream()
                .map(IncidentController::reviewView).toList());
        out.put("custodyLog", custody.findByCaptureIdOrderByPerformedAtAsc(incident.getCaptureId()).stream()
                .filter(c -> incident.getStreamId().equals(c.getStreamId()))
                .map(IncidentController::custodyView).toList());
        return ResponseEntity.ok(out);
    }

    // ---------------------------------------------------------------- actions

    /** SOC triage: dismiss with a reason, or escalate into the dual-track workflow. */
    @PostMapping("/{id}/triage")
    @PreAuthorize("hasAnyRole('SOC_ANALYST', 'ADMIN')")
    public ResponseEntity<?> triage(@PathVariable Long id, @RequestBody Map<String, String> body, Authentication auth) {
        String decision = body.getOrDefault("decision", body.get("action"));
        if (decision == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "decision is required: DISMISS or ESCALATE"));
        }
        IncidentService.Triage triage;
        try {
            triage = IncidentService.Triage.valueOf(decision.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "decision must be DISMISS or ESCALATE"));
        }
        Incident updated = workflow.triage(id, triage, body.get("reason"), auth.getName());
        return ResponseEntity.ok(detail(id, updated));
    }

    /** IR progress: one forward step per call, per the forward-only state machine. */
    @PatchMapping("/{id}/ir-track")
    @PreAuthorize("hasAnyRole('INCIDENT_RESPONDER', 'ADMIN')")
    public ResponseEntity<?> advanceIr(@PathVariable Long id, @RequestBody Map<String, String> body, Authentication auth) {
        String target = body.get("irStatus");
        if (target == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "irStatus is required"));
        }
        try {
            IrTrack track = workflow.advanceIr(id,
                    IrTrack.IrStatus.valueOf(target.trim().toUpperCase()),
                    body.get("remediationNotes"), auth.getName());
            return ResponseEntity.ok(detail(require(id), track, null));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "unknown irStatus: " + target));
        }
    }

    /** Forensics progress: one forward step per call; the report text rides along. */
    @PatchMapping("/{id}/df-track")
    @PreAuthorize("hasAnyRole('FORENSICS_ANALYST', 'ADMIN')")
    public ResponseEntity<?> advanceDf(@PathVariable Long id, @RequestBody Map<String, String> body, Authentication auth) {
        String target = body.get("dfStatus");
        if (target == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "dfStatus is required"));
        }
        try {
            DfTrack track = workflow.advanceDf(id,
                    DfTrack.DfStatus.valueOf(target.trim().toUpperCase()),
                    body.get("forensicReport"), auth.getName());
            return ResponseEntity.ok(detail(require(id), null, track));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message", "unknown dfStatus: " + target));
        }
    }

    /** The audit gate: approve and close, or reject one track back to work. */
    @PostMapping("/{id}/audit")
    @PreAuthorize("hasAnyRole('AUDITOR', 'ADMIN')")
    public ResponseEntity<?> audit(@PathVariable Long id, @RequestBody Map<String, String> body, Authentication auth) {
        String verdict = body.get("verdict");
        if (verdict == null) {
            return ResponseEntity.badRequest().body(Map.of("message",
                    "verdict is required: APPROVED, REJECTED_IR or REJECTED_FORENSICS"));
        }
        try {
            Incident updated = workflow.audit(id, AuditReview.Verdict.valueOf(verdict.trim().toUpperCase()),
                    body.get("reason"), auth.getName());
            return ResponseEntity.ok(detail(id, updated));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("message",
                    "verdict must be APPROVED, REJECTED_IR or REJECTED_FORENSICS"));
        }
    }

    // ------------------------------------------------------------------ views

    private Map<String, Object> detail(Long id, Incident incident) {
        return detail(incident, irTracks.findByIncidentId(id).orElse(null),
                dfTracks.findByIncidentId(id).orElse(null));
    }

    private Map<String, Object> detail(Incident incident, IrTrack ir, DfTrack df) {
        Map<String, Object> out = summary(incident, ir, df);
        out.put("auditHistory", auditReviews.findByIncidentIdOrderByReviewedAtAsc(incident.getId()).stream()
                .map(IncidentController::reviewView).toList());
        return out;
    }

    private Map<String, Object> summary(Incident i, IrTrack ir, DfTrack df) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("captureId", i.getCaptureId());
        m.put("streamId", i.getStreamId());
        m.put("status", i.getStatus().name());
        m.put("escalatedAt", i.getEscalatedAt());
        m.put("certInClockDeadline", i.getCertInClockDeadline());
        m.put("snapshotHash", i.getSnapshotHash());
        m.put("dismissedBy", i.getDismissedBy());
        m.put("dismissalReason", i.getDismissalReason());
        m.put("updatedBy", i.getUpdatedBy());
        m.put("updatedAt", i.getUpdatedAt());
        m.put("irTrack", ir == null ? null : irView(ir));
        m.put("dfTrack", df == null ? null : dfView(df));
        // Evidence context for the review panels: what the incident is about.
        m.put("captureSummary", captureSummary(i.getCaptureId()));
        return m;
    }

    /** Filename, hash and the session's findings, so panels can render without another round trip. */
    private Map<String, Object> captureSummary(Long captureId) {
        return captures.findById(captureId).map(c -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", c.getId());
            m.put("filename", c.getFilename());
            m.put("sha256", c.getSha256());
            m.put("overallGrade", c.getOverallGrade());
            m.put("capturedAt", c.getCapturedAt());
            return m;
        }).orElse(null);
    }

    private static Map<String, Object> irView(IrTrack t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("irStatus", t.getIrStatus().name());
        m.put("remediationNotes", t.getRemediationNotes());
        m.put("assignedTo", t.getAssignedTo());
        m.put("updatedAt", t.getUpdatedAt());
        return m;
    }

    private static Map<String, Object> dfView(DfTrack t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("dfStatus", t.getDfStatus().name());
        m.put("evidenceLockHash", t.getEvidenceLockHash());
        m.put("forensicReport", t.getForensicReport());
        m.put("assignedTo", t.getAssignedTo());
        m.put("updatedAt", t.getUpdatedAt());
        return m;
    }

    private static Map<String, Object> reviewView(AuditReview r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("auditorId", r.getAuditorId());
        m.put("verdict", r.getVerdict().name());
        m.put("rejectionReason", r.getRejectionReason());
        m.put("reviewedAt", r.getReviewedAt());
        return m;
    }

    private static Map<String, Object> custodyView(CustodyLog c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("action", c.getAction());
        m.put("performedBy", c.getPerformedBy());
        m.put("performedAt", c.getPerformedAt());
        m.put("notes", c.getNotes());
        return m;
    }

    private Incident require(Long id) {
        return incidents.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("no incident " + id));
    }
}
