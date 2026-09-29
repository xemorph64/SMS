package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One incident: a session whose findings were serious enough to require a
 * triage decision, and — if escalated — parallel Incident-Response and
 * Digital-Forensics tracks converging on an audit gate.
 *
 * <p>The {@code status} column is the parent state machine; the tracks have
 * their own progress states in {@link IrTrack} and {@link DfTrack}. All
 * timestamps are UTC {@code Instant}s, matching {@code Capture}.
 */
@Entity
@Table(name = "incident", indexes = {
        @Index(name = "idx_incident_status", columnList = "status"),
        @Index(name = "idx_incident_capture", columnList = "capture_id")
})
public class Incident {

    public enum Status { DETECTED, DISMISSED, ESCALATED, AWAITING_AUDIT, VERIFIED_CLOSED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "capture_id", nullable = false)
    private Long captureId;

    /** The bare TCP stream number, matching the stream_id convention used across the app. */
    @Column(name = "stream_id", nullable = false, length = 100)
    private String streamId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Status status = Status.DETECTED;

    private Instant escalatedAt;

    /** CERT-In Direction 70(1)/2022: escalation clock, six hours from escalation. */
    @Column(name = "cert_in_clock_deadline")
    private Instant certInClockDeadline;

    /**
     * Immutable digest binding this incident to its evidence: SHA-256 over the
     * capture's own upload hash plus the stream identity, computed once at
     * escalation and never recomputed.
     */
    @Column(length = 64)
    private String snapshotHash;

    @Column(name = "dismissed_by", length = 255)
    private String dismissedBy;

    @Column(name = "dismissal_reason", length = 2000)
    private String dismissalReason;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getCaptureId() { return captureId; }
    public void setCaptureId(Long captureId) { this.captureId = captureId; }
    public String getStreamId() { return streamId; }
    public void setStreamId(String streamId) { this.streamId = streamId; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public Instant getEscalatedAt() { return escalatedAt; }
    public void setEscalatedAt(Instant escalatedAt) { this.escalatedAt = escalatedAt; }
    public Instant getCertInClockDeadline() { return certInClockDeadline; }
    public void setCertInClockDeadline(Instant certInClockDeadline) { this.certInClockDeadline = certInClockDeadline; }
    public String getSnapshotHash() { return snapshotHash; }
    public void setSnapshotHash(String snapshotHash) { this.snapshotHash = snapshotHash; }
    public String getDismissedBy() { return dismissedBy; }
    public void setDismissedBy(String dismissedBy) { this.dismissedBy = dismissedBy; }
    public String getDismissalReason() { return dismissalReason; }
    public void setDismissalReason(String dismissalReason) { this.dismissalReason = dismissalReason; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
