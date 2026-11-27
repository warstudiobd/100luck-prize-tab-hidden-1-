-- Payout (withdraw) channels: bKash / Nagad / Upay are real, selectable withdrawal rails.
--
-- The player withdraws by binding their own number ("ই-ওয়ালেট বাঁধুন") and picking the
-- wallet; the money is paid out MANUALLY by the operator. So these rows are NOT deposit
-- channels and must not appear in the deposit picker:
--   * account_number stays empty — no invented wallet numbers are ever shown;
--   * is_active stays FALSE — the deposit screen only renders active rows;
--   * for_payout TRUE — /api/cashier/channels?for=withdraw returns exactly these.
-- Upay is added here because PayWise/payout both support it.

INSERT INTO deposit_channels
  (channel, account_label, account_number, reference, min_amount_cents, max_amount_cents,
   is_active, mode, api_provider, api_base_url, api_config, display_order, logo_url, for_payout)
VALUES
  ('bKash', 'Personal', '', '', 20000, 2500000, FALSE, 'manual', '', '', '{}'::jsonb, 10, '', TRUE),
  ('Nagad',  'Personal', '', '', 20000, 2500000, FALSE, 'manual', '', '', '{}'::jsonb, 20, '', TRUE),
  ('Upay',   'Personal', '', '', 20000, 2500000, FALSE, 'manual', '', '', '{}'::jsonb, 40, '', TRUE)
ON CONFLICT (channel) DO UPDATE
  SET for_payout = TRUE,
      min_amount_cents = EXCLUDED.min_amount_cents,
      max_amount_cents = EXCLUDED.max_amount_cents,
      account_number = '',
      updated_at = NOW();

-- Rocket is not used by this operator: keep it out of the payout picker entirely.
UPDATE deposit_channels SET for_payout = FALSE, updated_at = NOW() WHERE channel = 'Rocket';
