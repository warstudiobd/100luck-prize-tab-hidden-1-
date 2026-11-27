-- Seed: users, games catalog, sample pending cashier request
INSERT INTO users (username_or_phone, password_hash, email, phone, balance_cents, currency, vip_level, referral_code, is_admin)
VALUES
  ('admin', '$2a$10$8wEHKEs49jUaLzRxJgNFf.CEizpEvRNgNLsTtcoaiT3aBrKQQHr2m', NULL, NULL, 10000000, 'BDT', 10, 'ADMIN007', TRUE),
  ('demo',  '$2a$10$1CE5Jv6MrKXWLeTb6GFXMusB7LY1/eewb6f6dWhLqfmgVeiCiLhBG', NULL, NULL,  2500000, 'BDT', 3,  'DEMO777',  FALSE)
ON CONFLICT (username_or_phone) DO NOTHING;

INSERT INTO games_catalog (provider_code, game_code, title, title_bn, category, thumbnail_url, is_favorite_default, is_hot, sort_order) VALUES
  ('JILI',    'jili_super_ace',          'Super Ace',           'সুপার এস',          'SLOTS',  '/thumbs/jili_super_ace.svg',          TRUE,  TRUE,   1),
  ('JILI',    'jili_fortune_gems',       'Fortune Gems',        'ফরচুন জেমস',        'SLOTS',  '/thumbs/jili_fortune_gems.svg',       TRUE,  TRUE,   2),
  ('JILI',    'jili_money_coming',       'Money Coming',        'মানি কামিং',        'SLOTS',  '/thumbs/jili_money_coming.svg',       TRUE,  TRUE,   3),
  ('JILI',    'jili_boxing_king',        'Boxing King',         'বক্সিং কিং',        'SLOTS',  '/thumbs/jili_boxing_king.svg',        TRUE,  TRUE,   4),
  ('JILI',    'jili_super_elements',     'Super Elements',      'সুপার এলিমেন্টস',   'SLOTS',  '/thumbs/jili_super_elements.svg',     TRUE,  TRUE,   5),
  ('JILI',    'jili_super_elements_2',   'Super Elements 2',    'সুপার এলিমেন্টস ২', 'SLOTS',  '/thumbs/jili_super_elements_2.svg',   FALSE, TRUE,   6),
  ('FA_CHAI', 'fa_chai_chinese_new_year','Chinese New Year',    'চাইনিজ নিউ ইয়ার',  'SLOTS',  '/thumbs/fa_chai_chinese_new_year.svg',FALSE, TRUE,   7),
  ('FA_CHAI', 'fa_chai_golden_panther',  'Golden Panther',      'গোল্ডেন প্যান্থার', 'SLOTS',  '/thumbs/fa_chai_golden_panther.svg',  FALSE, TRUE,   8),
  ('SPRIBE',  'spribe_aviator',          'Aviator',             'এভিয়েটর',          'SLOTS',  '/thumbs/spribe_aviator.svg',          TRUE,  TRUE,   9),
  ('JILI',    'jili_mega_fishing',       'Mega Fishing',        'মেগা ফিশিং',        'FISHING','/thumbs/jili_mega_fishing.svg',       FALSE, TRUE,  10),
  ('FA_CHAI', 'fa_chai_shark_hunter',    'Shark Hunter',        'শার্ক হান্টার',     'FISHING','/thumbs/fa_chai_shark_hunter.svg',    FALSE, FALSE, 11),
  ('FA_CHAI', 'fa_chai_live_baccarat',   'Live Baccarat VIP',   'লাইভ ব্যাকারাত',    'LIVE',   '/thumbs/fa_chai_live_baccarat.svg',   FALSE, TRUE,  12),
  ('FA_CHAI', 'fa_chai_live_roulette',   'Live Roulette',       'লাইভ রুলেত',        'LIVE',   '/thumbs/fa_chai_live_roulette.svg',   FALSE, FALSE, 13),
  ('FA_CHAI', 'fa_chai_texass_holdem',   'Texas Hold''em',      'টেক্সাস হোল্ডেম',   'POKER',  '/thumbs/fa_chai_texass_holdem.svg',   FALSE, FALSE, 14),
  ('SPRIBE',  'spribe_hilo',             'Hi-Lo Poker',         'হাই-লো পোকার',      'POKER',  '/thumbs/spribe_hilo.svg',             FALSE, FALSE, 15),
  ('FA_CHAI', 'fa_chai_sportsbook',      'Sportsbook 1X2',      'স্পোর্টসবুক',       'SPORTS', '/thumbs/fa_chai_sportsbook.svg',      FALSE, TRUE,  16),
  ('JILI',    'jili_cricket_fever',      'Cricket Fever Live',  'ক্রিকেট ফিভার',     'SPORTS', '/thumbs/jili_cricket_fever.svg',      FALSE, FALSE, 17)
ON CONFLICT (game_code) DO UPDATE SET
  title = EXCLUDED.title, title_bn = EXCLUDED.title_bn, category = EXCLUDED.category,
  thumbnail_url = EXCLUDED.thumbnail_url, is_hot = EXCLUDED.is_hot, sort_order = EXCLUDED.sort_order;

-- Sample pending deposit so the Admin panel has data out of the box
INSERT INTO cashier_requests (user_id, request_type, channel, account_ref, trx_ref, amount_cents, status)
SELECT id, 'DEPOSIT', 'bKash', '01700000000', 'TESTSEED01', 50000, 'PENDING'
FROM users WHERE username_or_phone = 'demo'
  AND NOT EXISTS (SELECT 1 FROM cashier_requests WHERE trx_ref = 'TESTSEED01');
