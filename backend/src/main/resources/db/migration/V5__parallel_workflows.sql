ALTER TABLE findings_status ADD COLUMN noticed_at TIMESTAMP;
ALTER TABLE findings_status ADD COLUMN certin_reported_at TIMESTAMP;
ALTER TABLE findings_status ADD COLUMN ir_status VARCHAR(50);
ALTER TABLE findings_status ADD COLUMN forensics_status VARCHAR(50);

UPDATE findings_status SET 
    ir_status = CASE WHEN status IN ('VERIFIED', 'REJECTED') THEN status ELSE 'ESCALATED' END,
    forensics_status = CASE WHEN status IN ('VERIFIED', 'REJECTED') THEN status ELSE 'ESCALATED' END,
    noticed_at = escalated_at;

