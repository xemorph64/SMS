package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * The Incident-Responder track of an escalated incident.
 *
 * <p>Progress is one-way: {@code INVESTIGATING → CONTAINED → REMEDIATED →
 * RECOVERED}. Transitions are validated in {@code IncidentService}; the
 * forward-only rule is not expressed here so the entity stays a plain record
 * of state, like the rest of the domain package.
 */
@Entity
@Table(name = "ir_track")
public class IrTrack {

    public enum IrStatus { INVESTIGATING, CONTAINED, REMEDIATED, RECOVERED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "incident_id", nullable = false, unique = true)
    private Long incidentId;

    @Enumerated(EnumType.STRING)
    @Column(name = "ir_status", nullable = false, length = 32)
    private IrStatus irStatus = IrStatus.INVESTIGATING;

    @Column(name = "remediation_notes", length = 4000)
    private String remediationNotes;

    @Column(name = "assigned_to")
    private Long assignedTo;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getIncidentId() { return incidentId; }
    public void setIncidentId(Long incidentId) { this.incidentId = incidentId; }
    public IrStatus getIrStatus() { return irStatus; }
    public void setIrStatus(IrStatus irStatus) { this.irStatus = irStatus; }
    public String getRemediationNotes() { return remediationNotes; }
    public void setRemediationNotes(String remediationNotes) { this.remediationNotes = remediationNotes; }
    public Long getAssignedTo() { return assignedTo; }
    public void setAssignedTo(Long assignedTo) { this.assignedTo = assignedTo; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
