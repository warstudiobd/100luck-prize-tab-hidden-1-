-- PayWise LOCAL BDT payouts require the wallet account holder name.
ALTER TABLE payout_accounts ADD COLUMN IF NOT EXISTS account_holder text;
