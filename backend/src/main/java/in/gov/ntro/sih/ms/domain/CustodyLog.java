package in.gov.ntro.sih.ms.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "custody_log")
public class CustodyLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "capture_id", nullable = false)
    private Long captureId;

    @Column(name = "stream_id", nullable = false)
    private String streamId;

    @Column(nullable = false)
    private String action;   // e.g. EVIDENCE_VIEWED, REPORT_EXPORTED

    @Column(name = "performed_by", nullable = false)
    private String performedBy;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt = Instant.now();

    private String notes;

    public CustodyLog() {}

    public CustodyLog(Long captureId, String streamId, String action, String performedBy, String notes) {
        this.captureId = captureId;
        this.streamId = streamId;
        this.action = action;
        this.performedBy = performedBy;
        this.performedAt = Instant.now();
        this.notes = notes;
    }

    public Long getId() { return id; }
    public Long getCaptureId() { return captureId; }
    public String getStreamId() { return streamId; }
    public String getAction() { return action; }
    public String getPerformedBy() { return performedBy; }
    public Instant getPerformedAt() { return performedAt; }
    public String getNotes() { return notes; }
}
