CREATE TABLE message_reads (message_id VARCHAR(16) NOT NULL, user_id VARCHAR(16) NOT NULL, read_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(message_id, user_id))
