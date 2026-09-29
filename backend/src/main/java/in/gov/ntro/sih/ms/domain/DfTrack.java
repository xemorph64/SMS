package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * The Digital-Forensics track of an escalated incident, running in parallel
 * with {@link IrTrack} on a strictly partitioned evidence set (ISO/IEC 27037).
 *
 * <p>Progress is one-way: {@code EVIDENCE_LOCKED → ANALYZING → REPORT_GENERATED
 * → REPORT_SUBMITTED}. The evidence-lock hash is written once, at track
 * creation, and every subsequent transition leaves it untouched — a rejection
 * resets the status but never the lock.
 */
@Entity
@Table(name = "df_track")
public class DfTrack {

    public enum DfStatus { EVIDENCE_LOCKED, ANALYZING, REPORT_GENERATED, REPORT_SUBMITTED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false, unique = true)
    private Long incidentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "df_status", nullable = false, length = 32)
    private DfStatus dfStatus = DfStatus.EVIDENCE_LOCKED;

    /** SHA-256 of the locked evidence; equals the incident's snapshot hash at escalation. */
    @Column(name = "evidence_lock_hash", length = 64)
    private String evidenceLockHash;

    /** The forensic analyst's written report, required before submission to audit. */
    @Column(name = "forensic_report", columnDefinition = "TEXT")
    private String forensicReport;

    @Column(name = "assigned_to")
    private Long assignedTo;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }
    public DfStatus getDfStatus() { return dfStatus; }
    public void setDfStatus(DfStatus dfStatus) { this.dfStatus = dfStatus; }
    public String getEvidenceLockHash() { return evidenceLockHash; }
    public void setEvidenceLockHash(String evidenceLockHash) { this.evidenceLockHash = evidenceLockHash; }
    public String getForensicReport() { return forensicReport; }
    public void setForensicReport(String forensicReport) { this.forensicReport = forensicReport; }
    public Long getAssignedTo() { return assignedTo; }
    public void setAssignedTo(Long assignedTo) { this.assignedTo = assignedTo; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
