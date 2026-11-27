/**
 * SONALI7 — provider credential store + request signing
 *
 * Game aggregators hand over a base URL, a merchant/agent id and a secret key.
 * Secrets must be addable from the admin panel (the user's rule), but they
 * must never be readable back through an API. So:
 *
 *   • the browser posts the secret once,
 *   • we encrypt it with AES-256-GCM using SESSION_SECRET (never the DB),
 *   • and store only the ciphertext in platform_settings under
 *     provider_secrets (one JSON blob, one row).
 *
 * Rotating a provider's key merges one field in place. Nothing ever returns a
 * secret to a client.
 */
import crypto from "crypto";
import { getSetting, setSetting } from "./settings";

export const PROVIDER_SECRET_RE = /^[A-Za-z0-9._\-/+=]{16,200}$/;
/** Merchant ids / agent tokens are identifiers, not secrets — looser limits. */
export const PROVIDER_KEYID_RE = /^[A-Za-z0-9._\-/+=:]{2,160}$/;
const SECRETS_KEY = "provider_secrets";

type SecretRecord = { key?: string; keyId?: string };

/** Server-side key material. SESSION_SECRET is preferred; JWT_SECRET is the
 *  long-standing server secret already present in every deployment, so
 *  storing credentials works out of the box. */
function masterKey(): Buffer {
  const raw = String(
    process.env.SESSION_SECRET || process.env.PROVIDER_MASTER_KEY || process.env.JWT_SECRET || ""
  ).trim();
  if (raw.length < 16) throw new Error("Server key missing — set SESSION_SECRET (or JWT_SECRET) before saving provider credentials");
  return crypto.createHash("sha256").update(`sonali7-provider:${raw}`).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

function decrypt(blob: string): string {
  const [v, ivB64, tagB64, dataB64] = String(blob).split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function readAll(): Promise<Record<string, SecretRecord>> {
  const raw = await getSetting(SECRETS_KEY, "{}");
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, SecretRecord>) : {};
  } catch {
    return {};
  }
}

async function writeAll(all: Record<string, SecretRecord>): Promise<void> {
  await setSetting(SECRETS_KEY, JSON.stringify(all));
}

/** Store (or merge) one provider's credentials. Empty fields are left as-is. */
export async function storeProviderSecrets(code: string, key = "", keyId = "", opts: { merge?: boolean } = {}): Promise<void> {
  const all = await readAll();
  const prev = opts.merge ? all[code] ?? {} : {};
  const next: SecretRecord = { ...prev };
  if (key) next.key = encrypt(key);
  if (keyId) next.keyId = encrypt(keyId);
  if (!next.key && !next.keyId) {
    delete all[code];
  } else {
    all[code] = next;
  }
  await writeAll(all);
}

/** Plaintext credentials for server-side calls only.
 *  Falls back to the <CODE>_API_KEY env var so operators who prefer env-only
 *  secrets (or who rotate by redeploy) keep working. */
export async function getProviderSecrets(code: string): Promise<{ key: string; keyId: string }> {
  const all = await readAll();
  const rec = all[code];
  const key = rec?.key ? decrypt(rec.key) : "";
  const keyId = rec?.keyId ? decrypt(rec.keyId) : "";
  if (key) return { key, keyId };
  const envKey = String(process.env[`${code}_API_KEY`] ?? "").trim();
  const envId = String(process.env[`${code}_KEY_ID`] ?? "").trim();
  return { key: envKey, keyId: keyId || envId };
}

export async function hasProviderSecrets(code: string): Promise<boolean> {
  const all = await readAll();
  const rec = all[code];
  return Boolean(rec?.key || rec?.keyId);
}

/** All provider codes that have stored credentials — one read, for list views. */
export async function codesWithSecrets(): Promise<Set<string>> {
  const all = await readAll();
  return new Set(Object.entries(all).filter(([, rec]) => rec?.key || rec?.keyId).map(([code]) => code));
}

export type ProviderCreds = {
  baseUrl: string;
  authType: "hmac" | "bearer" | "basic" | "query";
  key: string;
  keyId: string;
  apiConfig: Record<string, string>;
};

/** Signed request to a provider. `body` is JSON-serialised once so the
 *  signature and the payload can never disagree. */
export async function providerRequest(
  creds: ProviderCreds,
  path: string,
  body: Record<string, unknown> = {},
  opts: { method?: "GET" | "POST"; timeoutMs?: number } = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const method = opts.method ?? "POST";
  const url = new URL(path.replace(/^\/+/, ""), creds.baseUrl.endsWith("/") ? creds.baseUrl : `${creds.baseUrl}/`);
  const payload = JSON.stringify(body);
  const ts = String(Date.now());

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-timestamp": ts,
  };
  if (creds.keyId) headers["x-merchant-id"] = creds.keyId;

  if (creds.authType === "bearer") {
    headers.authorization = `Bearer ${creds.key}`;
    headers["x-signature"] = crypto.createHmac("sha256", creds.key).update(`${ts}.${payload}`).digest("hex");
  } else if (creds.authType === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${creds.keyId}:${creds.key}`).toString("base64")}`;
    headers["x-signature"] = crypto.createHmac("sha256", creds.key).update(`${ts}.${payload}`).digest("hex");
  } else if (creds.authType === "query") {
    url.searchParams.set("merchant", creds.keyId);
    url.searchParams.set("token", creds.key);
    url.searchParams.set("ts", ts);
  } else {
    // hmac — most common for BD/Asia aggregators
    headers["x-signature"] = crypto.createHmac("sha256", creds.key).update(`${ts}.${payload}`).digest("hex");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : payload,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: (e as Error).name === "AbortError" ? "provider timed out" : (e as Error).message } };
  } finally {
    clearTimeout(timer);
  }
}
