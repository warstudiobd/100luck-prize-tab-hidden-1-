-- Withdrawal PIN.
--
-- A bound payout wallet can only be added, and every withdrawal can only be requested,
-- with a 4–6 digit PIN the player sets themselves. This protects a stolen/borrowed
-- session from redirecting a payout or emptying the balance.
--
-- Stored as a bcrypt hash, never in plain text; NULL means "not set yet", and the first
-- attempt to bind a wallet turns that attempt into the PIN the player chose.
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_pin_hash TEXT;

-- Failed-attempt counter so a PIN cannot be brute-forced from a hijacked session
-- (only 10^4–10^6 combinations exist; the lockout is what actually protects it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_pin_failures INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS withdraw_pin_locked_until TIMESTAMPTZ;
