import crypto from "crypto";
const BASE = "http://localhost:3000";
const SALT = "local_dev_salt_change_me";
const md5 = s => crypto.createHash("md5").update(s).digest("hex");
const sign = ts => md5(`${ts}${SALT}`);
const ts = () => String(Math.floor(Date.now() / 1000));
const jar = {}; // name -> cookie value
async function api(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie: `sonali7_token=${cookie}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/sonali7_token=([^;]+)/);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, token: m?.[1] ?? null };
}
const show = (label, r) => console.log(`\n■ ${label}\n  →`, JSON.stringify(r.json));
const ok = (cond, msg) => console.log(cond ? `  ✅ PASS ${msg}` : `  ❌ FAIL ${msg}`);

// ── 1. Home page renders
const home = await fetch(BASE + "/");
console.log(`■ GET / → HTTP ${home.status}`);
ok(home.status === 200, "home page 200");

// ── 2. Login as demo
const login = await api("/api/auth/login", { method: "POST", body: { username_or_phone: "demo", password: "demo1234" } });
show("login demo", login);
const demoTok = login.token;
ok(!!demoTok, "session cookie set");

// ── 3. Balance callback (action=balance, signed)
const bal = async (userRef) => { const t = ts(); return api("/api/wallet/callback", { method: "POST", body: { timestamp: t, sign: sign(t), action: "balance", user_id: userRef } }); };
show("callback balance (user_id=2, demo)", await bal("2"));

// ── 4. DEBIT 25.50 with idempotency
const t1 = ts(), cid = "E2E_BET_0001";
const debit = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t1, sign: sign(t1), action: "debit", call_id: cid, user_id: "2", amount: 25.5, provider_code: "JILI", game_code: "jili_super_ace", type: "bet" } });
show("debit 25.50 (bet)", debit);
ok(debit.json.code === 0, "debit accepted");
const balAfterDebit = debit.json.balance;

// 4b. Retry same call_id → must NOT double-debit
const t2 = ts();
const dup = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t2, sign: sign(t2), action: "debit", call_id: cid, user_id: "2", amount: 25.5, provider_code: "JILI", game_code: "jili_super_ace", type: "bet" } });
show("debit retry same call_id (idempotent)", dup);
ok(dup.json.balance === balAfterDebit && dup.json.duplicate === true, "duplicate call_id returned stored balance, no double debit");

// ── 5. CREDIT 100.00 (a win)
const t3 = ts();
const credit = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t3, sign: sign(t3), action: "credit", call_id: "E2E_WIN_0001", user_id: "2", amount: 100, provider_code: "JILI", game_code: "jili_super_ace", type: "win" } });
show("credit 100.00 (win)", credit);
ok(credit.json.code === 0 && credit.json.balance === balAfterDebit + 10000, "win credited");

// ── 6. CREDIT rb=1 (rollback of prior debit) → subtract w/ floor
const t4 = ts();
const rbCredit = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t4, sign: sign(t4), action: "credit", call_id: "E2E_RB_0001", user_id: "2", amount: 40, rb: 1, provider_code: "JILI", game_code: "jili_super_ace", type: "rollback" } });
show("credit rb=1 40.00 (undo)", rbCredit);
ok(rbCredit.json.code === 0, "rollback credit processed");

// ── 7. DEBIT without rb & insufficient balance → code 4 + current balance
const t5 = ts();
const poor = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t5, sign: sign(t5), action: "debit", call_id: "E2E_POOR_001", user_id: "2", amount: 99999999, provider_code: "JILI", game_code: "jili_super_ace", type: "bet" } });
show("debit insufficient funds", poor);
ok(poor.json.code === 4 && typeof poor.json.balance === "number", "insufficient funds error with balance returned");

// ── 8. Bad signature → code 1
const t6 = ts();
const badSig = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t6, sign: "deadbeef".repeat(4), action: "balance", user_id: "2" } });
show("bad signature", badSig);
ok(badSig.json.code === 1 && badSig.status === 200, "HTTP 200 + code 1 on bad signature");

// ── 9. Stale timestamp → code 2
const staleTs = String(Math.floor(Date.now() / 1000) - 3600);
const stale = await api("/api/wallet/callback", { method: "POST", body: { timestamp: staleTs, sign: sign(staleTs), action: "balance", user_id: "2" } });
show("stale timestamp (−1h)", stale);
ok(stale.json.code === 2, "stale timestamp rejected");

// ── 10. Unknown type is ignored, action routes only
const t7 = ts();
const weird = await api("/api/wallet/callback", { method: "POST", body: { timestamp: t7, sign: sign(t7), action: "balance", user_id: "2", type: "some_future_type_xyz" } });
show("unknown type tolerated", weird);
ok(weird.json.code === 0, "unknown type did not break routing");

// ── 11. DEMO SPIN (real ledger bet+win as demo user)
const spin = await api("/api/games/demo-spin", { method: "POST", body: { game_code: "jili_super_ace", bet_cents: 1000 }, cookie: demoTok });
show("demo spin ৳10", spin);
ok(spin.json.ok === true, "demo spin executed through wallet core");

// ── 12. Deposit request as demo → admin approve → balance up
const dep = await api("/api/cashier/request", { method: "POST", body: { request_type: "DEPOSIT", channel: "bKash", account_ref: "01711222333", trx_ref: "E2ETRX" + Date.now().toString().slice(-6), amount_cents: 50000 }, cookie: demoTok });
show("deposit request ৳500", dep);
ok(dep.json.ok, "deposit request created");

const adminLogin = await api("/api/auth/login", { method: "POST", body: { username_or_phone: "admin", password: "admin1234" } });
const adminTok = adminLogin.token;
const pending = await fetch(BASE + "/api/admin/pending", { headers: { cookie: `sonali7_token=${adminTok}` } }).then(r => r.json());
const depRow = (pending.pending || []).find(p => p.trx_ref?.startsWith("E2ETRX"));
console.log(`■ admin pending → ${pending.pending?.length} requests, found deposit id=${depRow?.id}`);
if (depRow) {
  const balBefore = (await api("/api/wallet/balance", { cookie: demoTok })).json.balance_cents;
  const approve = await fetch(BASE + "/api/cashier/decision", { method: "POST", headers: { "content-type": "application/json", cookie: `sonali7_token=${adminTok}` }, body: JSON.stringify({ id: depRow.id, decision: "APPROVE" }) }).then(r => r.json());
  show("admin approve deposit", { json: approve });
  const balAfter = (await api("/api/wallet/balance", { cookie: demoTok })).json.balance_cents;
  ok(balAfter - balBefore === 50000, `demo balance increased by ৳500 (${balBefore} → ${balAfter})`);
  // double-approve must be rejected
  const reapprove = await fetch(BASE + "/api/cashier/decision", { method: "POST", headers: { "content-type": "application/json", cookie: `sonali7_token=${adminTok}` }, body: JSON.stringify({ id: depRow.id, decision: "APPROVE" }) }).then(r => ({ status: r.status, json: r.json() }));
  const reapproveJson = await reapprove.json;
  ok(reapprove.status === 409, `double-approve blocked (HTTP ${reapprove.status})`);
}

// ── 13. Withdraw request → held → admin REJECT → refunded
const balPre = (await api("/api/wallet/balance", { cookie: demoTok })).json.balance_cents;
const wd = await api("/api/cashier/request", { method: "POST", body: { request_type: "WITHDRAW", channel: "Nagad", account_ref: "01912345678", amount_cents: 20000 }, cookie: demoTok });
show("withdraw request ৳200", wd);
const balHeld = (await api("/api/wallet/balance", { cookie: demoTok })).json.balance_cents;
ok(balPre - balHeld === 20000, "withdrawal held from balance");
const pending2 = await fetch(BASE + "/api/admin/pending", { headers: { cookie: `sonali7_token=${adminTok}` } }).then(r => r.json());
const wdRow = (pending2.pending || []).find(p => p.request_type === "WITHDRAW" && p.account_ref === "01912345678");
if (wdRow) {
  await fetch(BASE + "/api/cashier/decision", { method: "POST", headers: { "content-type": "application/json", cookie: `sonali7_token=${adminTok}` }, body: JSON.stringify({ id: wdRow.id, decision: "REJECT" }) });
  const balRefund = (await api("/api/wallet/balance", { cookie: demoTok })).json.balance_cents;
  ok(balRefund === balPre, `rejected withdrawal auto-refunded (${balHeld} → ${balRefund})`);
}

// ── 14. Register new user with referral code
const reg = await api("/api/auth/register", { method: "POST", body: { username_or_phone: "e2e_user_" + Date.now().toString().slice(-6), password: "test1234", referral_code: "DEMO777" } });
show("register with referral DEMO777", reg);
ok(reg.json.ok === true, "registered + auto-login");

// ── 15. Games catalog + launch
const games = await fetch(BASE + "/api/games").then(r => r.json());
ok(games.games?.length >= 17, `catalog serves ${games.games?.length} games`);
const launch = await api("/api/games/launch", { method: "POST", body: { game_code: "jili_super_ace" }, cookie: demoTok });
show("launch jili_super_ace", launch);
ok(launch.json.launch_url?.includes("/play/demo"), "demo launch URL returned");

console.log("\n═══ E2E complete ═══");
