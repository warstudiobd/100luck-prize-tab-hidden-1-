-- ═══════════════════════════════════════════════════════════════════════
--  SONALI7 — Live chat pictures (2026-11-23, additive only)
--  Adds an optional picture to a chat message so players can send a payment
--  slip / screenshot and agents can reply with a picture.
--  Stored the same way as announcement & popup images: an https URL or a
--  downscaled data:image JPEG produced by the admin/player upload widget.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';

-- Preview in the admin inbox needs the newest body/flag quickly per conversation.
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_id ON chat_messages (conversation_id, id DESC);
