package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "findings_status",
       uniqueConstraints = @UniqueConstraint(columnNames = {"capture_id", "stream_id"}))
public class FindingsStatus {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "capture_id", nullable = false)
    private Long captureId;

    @Column(name = "stream_id", nullable = false)
    private String streamId;

    @Column(nullable = false)
    private String status = "NEW";

    @Column(name = "escalated_at")
    private Instant escalatedAt;

    @Column(name = "updated_by")
    private String updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public FindingsStatus() {}

    public FindingsStatus(Long captureId, String streamId, String status, String updatedBy) {
        this.captureId = captureId;
        this.streamId = streamId;
        this.status = status;
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
        if ("ESCALATED".equals(status)) this.escalatedAt = Instant.now();
    }

    // Getters & Setters
    public Long getId() { return id; }
    public Long getCaptureId() { return captureId; }
    public String getStreamId() { return streamId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getEscalatedAt() { return escalatedAt; }
    public void setEscalatedAt(Instant escalatedAt) { this.escalatedAt = escalatedAt; }
    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public void setCaptureId(Long captureId) { this.captureId = captureId; }
    public void setStreamId(String streamId) { this.streamId = streamId; }
}
