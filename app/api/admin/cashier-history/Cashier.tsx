import { useEffect, useState, useCallback } from "react";
import { api, fmtBDT, fmtDate } from "../api";
import { Pill, RefreshButton, type Notify } from "../shared";

type Pending = {
  id: number; user_id: number; username_or_phone: string; phone: string | null;
  request_type: "DEPOSIT" | "WITHDRAW"; channel: string; account_ref: string; trx_ref: string;
  amount_cents: number; status: string; created_at: string;
  /** withdrawal only: the number bound to the player's account for this gateway */
  bound_number?: string | null; bound_at?: string | null; number_is_bound?: boolean | null;
};
type HistoryItem = {
  id: number; username_or_phone: string; request_type: "DEPOSIT" | "WITHDRAW";
  channel: string; trx_ref: string | null; amount_cents: number; status: string; created_at: string;
};

export default function Cashier({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<"DEPOSIT" | "WITHDRAW">("DEPOSIT");
  const [view, setView] = useState<"PENDING" | "HISTORY">("PENDING");
  const [rows, setRows] = useState<Pending[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [counts, setCounts] = useState<{ request_type: string; n: number; total: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (view === "PENDING") {
        const d = await api<{ pending: Pending[]; counts: { request_type: string; n: number; total: string }[] }>(`/api/admin/pending?type=${tab}`);
        setRows(d.pending); setCounts(d.counts);
      } else {
        const h = await api<{ history: HistoryItem[] }>(`/api/admin/cashier-history?type=${tab}`);
        setHistory(h.history);
      }
    } catch (e: any) { notify(e.message, true); }
    finally { setBusy(false); }
  }, [tab, view, notify]);

  useEffect(() => { load(); }, [load]);

  const decide = async (row: Pending, decision: "APPROVE" | "REJECT") => {
    const verb = decision === "APPROVE" ? (tab === "DEPOSIT" ? "APPROVE deposit and CREDIT the player" : "APPROVE withdrawal (mark paid — funds were already held)") : (tab === "DEPOSIT" ? "REJECT deposit" : "REJECT withdrawal and REFUND the held funds");
    const isPayWise = tab === "DEPOSIT" && /paywise/i.test(row.channel);
    const refLabel = isPayWise ? "PayWise order reference (not a bKash/Nagad/Upay TrxID)" : "Submitted wallet TrxID";
    if (!window.confirm(`${verb}?\n\nPlayer: ${row.username_or_phone}\nAmount: ${fmtBDT(row.amount_cents)}\nChannel: ${row.channel}\n${tab === "DEPOSIT" ? `${refLabel}: ${row.trx_ref}${isPayWise ? "\nVerify the matching completed payment in the PayWise merchant dashboard before approving." : ""}` : `PAY BY HAND\nWallet: ${row.channel}\nNumber: ${row.account_ref}\nAmount: ${fmtBDT(row.amount_cents)}\n\nSend the money first, then approve.`}`)) return;
    setDeciding(row.id);
    try {
      await api("/api/cashier/decision", { body: { id: row.id, decision } });
      notify(`${decision === "APPROVE" ? "Approved" : "Rejected"} ✓`);
      load();
    } catch (e: any) { notify(e.message, true); }
    finally { setDeciding(null); }
  };

  const c = counts.find(x => x.request_type === tab);
  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div className="panel-head">
        <span className="panel-title">Manual cashier · {view === "PENDING" ? "pending " : ""}{tab === "DEPOSIT" ? "deposits" : "withdrawals"}{view === "HISTORY" ? " history" : ""}</span>
        <div className="toolbar">
          <div className="toolbar" role="tablist">
            <button className={`btn-ghost ${tab === "DEPOSIT" ? "active-tab" : ""}`} style={tab === "DEPOSIT" ? { borderColor: "rgba(245,184,0,.5)", color: "var(--gold)" } : {}} onClick={() => setTab("DEPOSIT")}>Deposits</button>
            <button className="btn-ghost" style={tab === "WITHDRAW" ? { borderColor: "rgba(245,184,0,.5)", color: "var(--gold)" } : {}} onClick={() => setTab("WITHDRAW")}>Withdrawals</button>
          </div>
          <RefreshButton onClick={load} busy={busy} />
        </div>
      </div>
      <div className="toolbar" role="tablist" aria-label="Request view" style={{ marginBottom: 10 }}>
        <button role="tab" aria-selected={view === "PENDING"} className={`btn-ghost ${view === "PENDING" ? "active-tab" : ""}`} onClick={() => setView("PENDING")}>Pending</button>
        <button role="tab" aria-selected={view === "HISTORY"} className={`btn-ghost ${view === "HISTORY" ? "active-tab" : ""}`} onClick={() => setView("HISTORY")}>History</button>
      </div>
      {view === "PENDING" ? <>
      {c ? <p className="muted" style={{ marginBottom: 8 }}>{c.n} pending · total {fmtBDT(c.total)}</p> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Player</th><th>Channel</th><th>{tab === "DEPOSIT" ? "Submitted reference" : "Payout account"}</th><th>Amount</th><th>Decision</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.username_or_phone}</div>
                  {r.phone ? <div className="muted">{r.phone}</div> : null}
                </td>
                <td><Pill kind="gold">{r.channel}</Pill></td>
                <td className="mono">
                  {tab === "DEPOSIT" ? (
                    <div>
                      <div className="muted" style={{ fontSize: 10, marginBottom: 3 }}>
                        {/paywise/i.test(r.channel) ? "PayWise order ref — not a wallet TrxID" : "Submitted wallet TrxID"}
                      </div>
                      <strong>{r.trx_ref}</strong>
                      {/paywise/i.test(r.channel) && <div className="muted" style={{ fontSize: 10, marginTop: 4, maxWidth: 240, whiteSpace: "normal" }}>Check this reference and amount in the PayWise merchant dashboard. Do not compare it with a bKash/Nagad/Upay TrxID.</div>}
                    </div>
                  ) : (
                    // The operator pays this number BY HAND, so the row shows the gateway,
                    // the whole number (no masking, no truncation) and whether it is still
                    // the number bound to the player's account.
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Pill kind="gold">{r.channel}</Pill>
                        <span className="mono" style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".02em" }}>{r.account_ref}</span>
                        <button className="btn-ghost" style={{ padding: "2px 6px", fontSize: 10 }}
                          onClick={() => { navigator.clipboard?.writeText(r.account_ref); notify("Number copied ✓"); }}>
                          Copy
                        </button>
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                        {r.number_is_bound
                          ? `✔ bound to this player${r.bound_at ? ` · since ${fmtDate(r.bound_at)}` : ""}`
                          : `⚠ not the currently bound ${r.channel} number — check before paying`}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                        Send {fmtBDT(r.amount_cents)} → {r.channel} {r.account_ref}, then Approve
                      </div>
                    </div>
                  )}
                  {tab === "DEPOSIT" && r.account_ref ? <div className="muted">{/paywise/i.test(r.channel) ? `Gateway: ${r.account_ref}` : `from ${r.account_ref}`}</div> : null}
                </td>
                <td className="mono" style={{ fontWeight: 800 }}>{fmtBDT(r.amount_cents)}</td>
                <td>
                  <div className="toolbar">
                    <button className="btn-ok" disabled={deciding === r.id} onClick={() => decide(r, "APPROVE")}>{deciding === r.id ? "…" : "Approve"}</button>
                    <button className="btn-danger" disabled={deciding === r.id} onClick={() => decide(r, "REJECT")}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !busy ? <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>Nothing pending 🎉</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>Deposits credit the player on approval. Withdrawals debited the player at request time — rejecting refunds automatically; approving marks the payout as done (pay out by hand to the bKash / Nagad / Upay number shown, first).</p>
      </> : <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Player</th><th>Channel</th><th>Reference</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {history.map(r => {
              const status = String(r.status || "").toUpperCase();
              const kind = status === "APPROVED" || status === "PAID" ? "green" : status === "REJECTED" ? "red" : "gray";
              return <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                <td style={{ fontWeight: 700 }}>{r.username_or_phone}</td>
                <td><Pill kind="gold">{r.channel}</Pill></td>
                <td className="mono" style={{ maxWidth: 180, overflowWrap: "anywhere" }}>{r.trx_ref || "—"}</td>
                <td className="mono" style={{ fontWeight: 800 }}>{fmtBDT(r.amount_cents)}</td>
                <td><Pill kind={kind}>{status || "UNKNOWN"}</Pill></td>
              </tr>;
            })}
            {!history.length && !busy ? <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 20 }}>No {tab === "DEPOSIT" ? "deposit" : "withdrawal"} history yet.</td></tr> : null}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
