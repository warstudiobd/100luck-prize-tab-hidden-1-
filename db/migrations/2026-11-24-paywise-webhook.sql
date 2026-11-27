-- ─────────────────────────────────────────────────────────────────────────────
--  PayWise Asia webhook deliveries
--
--  Every POST from PayWise is stored here *before* any money moves, including the
--  raw body and whether the signature verified. Two reasons:
--    1. Support: "the player says he paid" is answered by the stored payload, not
--       by guessing.
--    2. Replay: the unique event id lets the handler ignore duplicates. PayWise
--       documents at-least-once delivery, so a retry must never double-credit.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_events (
  id             BIGSERIAL PRIMARY KEY,
  provider       TEXT        NOT NULL DEFAULT 'paywise',
  event_id       TEXT,                     -- provider's event/transaction id, if sent
  signature_ok   BOOLEAN     NOT NULL,     -- did X-PAYWISE-SIGNATURE verify?
  sig_scheme     TEXT,                     -- which scheme matched (debugging aid)
  trx_ref        TEXT,                     -- what we matched against cashier_requests
  outcome        TEXT        NOT NULL,     -- credited | ignored | unknown_ref | bad_signature | error
  http_status    INT         NOT NULL,
  amount_cents   BIGINT,
  payload        JSONB,                    -- raw body, exactly as received
  raw_body       TEXT,
  remote_ip      TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_provider_event
  ON webhook_events (provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_outcome
  ON webhook_events (provider, outcome, received_at DESC);
