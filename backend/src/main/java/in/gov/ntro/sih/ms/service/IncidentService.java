package in.gov.ntro.sih.ms.service;

import in.gov.ntro.sih.ms.domain.AuditReview;
import in.gov.ntro.sih.ms.domain.Capture;
import in.gov.ntro.sih.ms.domain.CustodyLog;
import in.gov.ntro.sih.ms.domain.DfTrack;
import in.gov.ntro.sih.ms.domain.Finding;
import in.gov.ntro.sih.ms.domain.Incident;
import in.gov.ntro.sih.ms.domain.IrTrack;
import in.gov.ntro.sih.ms.domain.MailSession;
import in.gov.ntro.sih.ms.repo.AuditReviewRepository;
import in.gov.ntro.sih.ms.repo.CaptureRepository;
import in.gov.ntro.sih.ms.repo.CustodyLogRepository;
import in.gov.ntro.sih.ms.repo.DfTrackRepository;
import in.gov.ntro.sih.ms.repo.IncidentRepository;
import in.gov.ntro.sih.ms.repo.IrTrackRepository;
import in.gov.ntro.sih.ms.repo.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dual-track incident state machine, and the only writer of workflow state.
 *
 * <p>Parent lifecycle: {@code DETECTED → (DISMISSED | ESCALATED) →
 * AWAITING_AUDIT → VERIFIED_CLOSED}, with rejections returning the parent to
 * {@code ESCALATED} while exactly one track is reset. The tracks advance
 * forward-only in parallel:
 *
 * <pre>
 *   IR: INVESTIGATING → CONTAINED → REMEDIATED → RECOVERED
 *   DF: EVIDENCE_LOCKED → ANALYZING → REPORT_GENERATED → REPORT_SUBMITTED
 * </pre>
 *
 * <p>The parent only converges on the audit gate when <em>both</em> tracks
 * have finished — one finished track alone never moves it. Every transition
 * lands in the ISO/IEC 27037 custody ledger, so the workflow history and the
 * evidence-access history live in one place.
 */
@Service
public class IncidentService {

    private static final Logger log = LoggerFactory.getLogger(IncidentService.class);

    /** CERT-In Direction No. 70(1)/2022 — six-hour reporting clock from escalation. */
    static final Duration CERT_IN_SLA = Duration.ofHours(6);

    private final IncidentRepository incidents;
    private final IrTrackRepository irTracks;
    private final DfTrackRepository dfTracks;
    private final AuditReviewRepository auditReviews;
    private final CustodyLogRepository custody;
    private final CaptureRepository captures;
    private final UserRepository users;

    public IncidentService(IncidentRepository incidents, IrTrackRepository irTracks,
                           DfTrackRepository dfTracks, AuditReviewRepository auditReviews,
                           CustodyLogRepository custody, CaptureRepository captures, UserRepository users) {
        this.incidents = incidents;
        this.irTracks = irTracks;
        this.dfTracks = dfTracks;
        this.auditReviews = auditReviews;
        this.custody = custody;
        this.captures = captures;
        this.users = users;
    }

    /** A transition the current state does not allow — surfaced to the caller as HTTP 409. */
    public static class InvalidTransition extends RuntimeException {
        public InvalidTransition(String message) { super(message); }
    }

    // ---------------------------------------------------------------- detection

    /**
     * Create a {@code DETECTED} incident for every session of a just-completed
     * analysis that carried a critical or high finding.
     *
     * <p>Idempotent: an incident already exists for a (capture, stream) pair
     * from a retry or a re-analysis, so it is left exactly as it is — workflow
     * progress is never reset by re-running the engine. Called inside the
     * caller's transaction.
     */
    public void detectFrom(Capture capture) {
        for (MailSession session : capture.getSessions()) {
            boolean serious = session.getFindings() == null ? false : session.getFindings().stream()
                    .map(Finding::getSeverity)
                    .anyMatch(s -> "critical".equalsIgnoreCase(s) || "high".equalsIgnoreCase(s));
            if (!serious) continue;
            String streamId = String.valueOf(session.getStreamIndex());
            if (incidents.findByCaptureIdAndStreamId(capture.getId(), streamId).isPresent()) continue;

            Incident incident = new Incident();
            incident.setCaptureId(capture.getId());
            incident.setStreamId(streamId);
            incident.setStatus(Incident.Status.DETECTED);
            incidents.save(incident);
            log.info("Incident detected: capture {} stream {}", capture.getId(), streamId);
        }
    }

    // ------------------------------------------------------------------ triage

    /** The SOC analyst's triage decision on a detected incident. */
    public enum Triage { DISMISS, ESCALATE }

    /**
     * Triage a {@code DETECTED} incident: dismiss it with a reason, or escalate
     * it into the dual-track workflow.
     *
     * <p>Escalation snapshots the evidence (SHA-256 over the capture's own
     * upload hash — the raw-PCAP digest — plus the incident metadata), starts
     * the CERT-In six-hour clock in UTC, and opens both tracks: IR begins
     * {@code INVESTIGATING}, forensics begins with evidence locked.
     */
    @Transactional
    public Incident triage(Long incidentId, Triage decision, String reason, String actor) {
        Incident incident = require(incidentId);
        if (incident.getStatus() != Incident.Status.DETECTED) {
            throw new InvalidTransition(
                    "Only DETECTED incidents can be triaged; incident " + incidentId + " is " + incident.getStatus());
        }

        if (decision == Triage.ESCALATE) {
            Instant now = Instant.now();
            incident.setStatus(Incident.Status.ESCALATED);
            incident.setEscalatedAt(now);
            incident.setCertInClockDeadline(now.plus(CERT_IN_SLA));
            incident.setSnapshotHash(snapshotHash(incident));
            incident.setUpdatedBy(actor);

            IrTrack ir = new IrTrack();
            ir.setIncidentId(incident.getId());
            ir.setIrStatus(IrTrack.IrStatus.INVESTIGATING);
            ir.setAssignedTo(resolveUserId(actor));
            ir.setUpdatedAt(now);
            irTracks.save(ir);

            DfTrack df = new DfTrack();
            df.setIncidentId(incident.getId());
            df.setDfStatus(DfTrack.DfStatus.EVIDENCE_LOCKED);
            df.setEvidenceLockHash(incident.getSnapshotHash());
            df.setAssignedTo(resolveUserId(actor));
            df.setUpdatedAt(now);
            dfTracks.save(df);

            custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(), "ESCALATED", actor,
                    "Escalated to dual-track response. Evidence snapshot " + incident.getSnapshotHash()
                            + "; CERT-In 6-hour clock started."));
        } else {
            if (reason == null || reason.isBlank()) {
                throw new InvalidTransition("A dismissal reason is required");
            }
            incident.setStatus(Incident.Status.DISMISSED);
            incident.setDismissedBy(actor);
            incident.setDismissalReason(trim(reason, 2000));
            incident.setUpdatedBy(actor);
            custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(), "DISMISSED", actor,
                    "Dismissed by SOC triage: " + trim(reason, 300)));
        }
        return incidents.save(incident);
    }

    // --------------------------------------------------------------- IR track

    /**
     * Advance the IR track one step: {@code INVESTIGATING → CONTAINED →
     * REMEDIATED → RECOVERED}. Only the exact next state is accepted, so no
     * step can be skipped or reversed. Notes, when given, are appended to the
     * track's remediation record.
     */
    @Transactional
    public IrTrack advanceIr(Long incidentId, IrTrack.IrStatus target, String notes, String actor) {
        IrTrack track = irTracks.findByIncidentId(incidentId)
                .orElseThrow(() -> new InvalidTransition("Incident " + incidentId + " has no IR track — it was never escalated"));
        IrTrack.IrStatus next = stepAfter(track.getIrStatus(), IrTrack.IrStatus.values(), "Incident Response");
        if (target != next) {
            throw new InvalidTransition(
                    "IR track is " + track.getIrStatus() + "; the only legal next step is " + next + ", got " + target);
        }
        track.setIrStatus(target);
        if (notes != null && !notes.isBlank()) {
            track.setRemediationNotes(trim(notes, 4000));
        }
        track.setAssignedTo(resolveUserId(actor));
        track.setUpdatedAt(Instant.now());
        irTracks.save(track);

        Incident incident = require(incidentId);
        custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(),
                "IR_TRACK_" + target.name(), actor, "Incident Response track advanced to " + target));
        converge(incident, actor);
        return track;
    }

    // --------------------------------------------------------------- DF track

    /**
     * Advance the DF track one step: {@code EVIDENCE_LOCKED → ANALYZING →
     * REPORT_GENERATED → REPORT_SUBMITTED}. The forensic report text is
     * required at submission — the audit gate reviews it, so an empty
     * submission is rejected here rather than downstream.
     */
    @Transactional
    public DfTrack advanceDf(Long incidentId, DfTrack.DfStatus target, String report, String actor) {
        DfTrack track = dfTracks.findByIncidentId(incidentId)
                .orElseThrow(() -> new InvalidTransition("Incident " + incidentId + " has no DF track — it was never escalated"));
        DfTrack.DfStatus next = stepAfter(track.getDfStatus(), DfTrack.DfStatus.values(), "Digital Forensics");
        if (target != next) {
            throw new InvalidTransition(
                    "DF track is " + track.getDfStatus() + "; the only legal next step is " + next + ", got " + target);
        }
        if (target == DfTrack.DfStatus.REPORT_SUBMITTED) {
            String text = report != null && !report.isBlank() ? report : track.getForensicReport();
            if (text == null || text.isBlank()) {
                throw new InvalidTransition("A forensic report must be attached before submission to audit");
            }
            track.setForensicReport(trim(text, 100000));
        } else if (report != null && !report.isBlank()) {
            track.setForensicReport(trim(report, 100000));
        }
        track.setDfStatus(target);
        track.setAssignedTo(resolveUserId(actor));
        track.setUpdatedAt(Instant.now());
        // The evidence-lock hash is deliberately never rewritten here.
        dfTracks.save(track);

        Incident incident = require(incidentId);
        custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(),
                "DF_TRACK_" + target.name(), actor, "Digital Forensics track advanced to " + target));
        converge(incident, actor);
        return track;
    }

    // ------------------------------------------------------------------- audit

    /**
     * Record an auditor verdict on an incident at the {@code AWAITING_AUDIT}
     * gate. Approval closes the incident; each rejection returns the parent to
     * {@code ESCALATED} and resets exactly one track, leaving the other track's
     * completed work untouched — forensics' evidence lock survives a forensics
     * rejection.
     */
    @Transactional
    public Incident audit(Long incidentId, AuditReview.Verdict verdict, String reason, String actor) {
        Incident incident = require(incidentId);
        if (incident.getStatus() != Incident.Status.AWAITING_AUDIT) {
            throw new InvalidTransition(
                    "Only AWAITING_AUDIT incidents can be reviewed; incident " + incidentId + " is " + incident.getStatus());
        }
        boolean rejection = verdict != AuditReview.Verdict.APPROVED;
        if (rejection && (reason == null || reason.isBlank())) {
            throw new InvalidTransition("A rejection requires written feedback for the track being returned to");
        }

        switch (verdict) {
            case APPROVED -> incident.setStatus(Incident.Status.VERIFIED_CLOSED);
            case REJECTED_IR -> {
                incident.setStatus(Incident.Status.ESCALATED);
                IrTrack ir = irTracks.findByIncidentId(incidentId).orElseThrow();
                ir.setIrStatus(IrTrack.IrStatus.INVESTIGATING);
                ir.setUpdatedAt(Instant.now());
                irTracks.save(ir);
            }
            case REJECTED_FORENSICS -> {
                incident.setStatus(Incident.Status.ESCALATED);
                DfTrack df = dfTracks.findByIncidentId(incidentId).orElseThrow();
                df.setDfStatus(DfTrack.DfStatus.ANALYZING);
                df.setUpdatedAt(Instant.now());
                dfTracks.save(df);
            }
        }
        incident.setUpdatedBy(actor);

        AuditReview review = new AuditReview();
        review.setIncidentId(incidentId);
        review.setAuditorId(resolveUserId(actor));
        review.setVerdict(verdict);
        review.setRejectionReason(trim(reason, 2000));
        review.setReviewedAt(Instant.now());
        auditReviews.save(review);

        custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(), "AUDIT_" + verdict.name(), actor,
                verdict + (rejection ? ": " + trim(reason, 300) : "")));
        return incidents.save(incident);
    }

    // -------------------------------------------------------------- automation

    /**
     * The convergence gate: move the parent to {@code AWAITING_AUDIT} only when
     * both tracks have finished. Called after every track advance; a single
     * finished track leaves the parent in {@code ESCALATED} and the other track
     * keeps working.
     */
    private void converge(Incident incident, String actor) {
        if (incident.getStatus() != Incident.Status.ESCALATED) return;
        IrTrack.IrStatus ir = irTracks.findByIncidentId(incident.getId()).map(IrTrack::getIrStatus).orElse(null);
        DfTrack.DfStatus df = dfTracks.findByIncidentId(incident.getId()).map(DfTrack::getDfStatus).orElse(null);
        if (ir == IrTrack.IrStatus.RECOVERED && df == DfTrack.DfStatus.REPORT_SUBMITTED) {
            incident.setStatus(Incident.Status.AWAITING_AUDIT);
            incident.setUpdatedBy(actor);
            incidents.save(incident);
            custody.save(new CustodyLog(incident.getCaptureId(), incident.getStreamId(), "AWAITING_AUDIT", actor,
                    "Both tracks complete — incident queued for compliance audit."));
        }
    }

    // ----------------------------------------------------------------- helpers

    private Incident require(Long id) {
        return incidents.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("no incident " + id));
    }

    /**
     * One-step rule for a forward-only enum: the only legal target is the
     * value after the current one. At the end of the track there is nothing to
     * advance to, and that is an invalid transition like any other.
     */
    private static <T extends Enum<T>> T stepAfter(T current, T[] values, String trackName) {
        int next = current.ordinal() + 1;
        if (next >= values.length) {
            throw new InvalidTransition(trackName + " track is already at " + current + " — nothing further to advance to");
        }
        return values[next];
    }

    /**
     * The immutable incident snapshot: SHA-256 over the capture's upload-time
     * digest (the raw-PCAP hash taken before anything touched the bytes) plus
     * the incident's stream identity. Deterministic and re-computable offline
     * from data that never changes, so an auditor can verify it with nothing
     * but this database and the stored capture.
     */
    private String snapshotHash(Incident incident) {
        Capture capture = captures.findById(incident.getCaptureId())
                .orElseThrow(() -> new IllegalArgumentException("no capture " + incident.getCaptureId()));
        String basis = capture.getSha256() + ":" + incident.getCaptureId() + ":" + incident.getStreamId();
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(basis.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private Long resolveUserId(String username) {
        if (username == null || username.isBlank()) return null;
        return users.findByUsername(username).map(u -> u.getId()).orElse(null);
    }

    private static String trim(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
