CREATE TABLE blocked_users (blocker_id VARCHAR(16) NOT NULL, blocked_id VARCHAR(16) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(blocker_id, blocked_id));
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_from_id ON messages(from_id);
CREATE INDEX idx_chats_user_a ON chats(user_a);
CREATE INDEX idx_chats_user_b ON chats(user_b);
