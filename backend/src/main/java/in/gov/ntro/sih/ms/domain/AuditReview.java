package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * One auditor decision on an incident that reached {@code AWAITING_AUDIT}.
 *
 * <p>Rows are append-only: a rejection does not update anything, it adds a
 * record and resets the target track, so the full review history of an
 * incident survives for compliance.
 */
@Entity
@Table(name = "audit_review", indexes = {
        @Index(name = "idx_audit_incident", columnList = "incident_id")
})
public class AuditReview {

    public enum Verdict { APPROVED, REJECTED_IR, REJECTED_FORENSICS }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false)
    private Long incidentId;

    @Column(name = "auditor_id")
    private Long auditorId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Verdict verdict;

    @Column(name = "rejection_reason", length = 2000)
    private String rejectionReason;

    @Column(name = "reviewed_at", nullable = false)
    private Instant reviewedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }
    public Long getAuditorId() { return auditorId; }
    public void setAuditorId(Long auditorId) { this.auditorId = auditorId; }
    public Verdict getVerdict() { return verdict; }
    public void setVerdict(Verdict verdict) { this.verdict = verdict; }
    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }
    public Instant getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Instant reviewedAt) { this.reviewedAt = reviewedAt; }
}
