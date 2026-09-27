-- P2: Findings Status table (replaces localStorage status machine)
CREATE TABLE findings_status (
    id          BIGSERIAL PRIMARY KEY,
    capture_id  BIGINT       NOT NULL,
    stream_id   VARCHAR(100) NOT NULL,
    status      VARCHAR(50)  NOT NULL DEFAULT 'NEW',
    escalated_at TIMESTAMP,
    updated_by  VARCHAR(255),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (capture_id, stream_id)
);

-- P4: Chain-of-Custody log (evidence access audit trail)
CREATE TABLE custody_log (
    id           BIGSERIAL PRIMARY KEY,
    capture_id   BIGINT       NOT NULL,
    stream_id    VARCHAR(100) NOT NULL,
    action       VARCHAR(100) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    notes        TEXT
);
