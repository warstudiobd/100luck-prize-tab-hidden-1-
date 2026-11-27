/**
 * The one place the support / agent Telegram handle lives.
 *
 * `https://t.me/<user>` is a Telegram App Link: the OS opens the Telegram app
 * when one is installed and falls back to the web profile otherwise. Do not
 * hardcode a `tg://` URL — it fails silently for anyone without the app, and do
 * not hardcode a handle anywhere else in the app; import from here.
 *
 * Verified live: t.me/warstudiosite -> "War Studio" (accepts messages).
 */
export const TG_AGENT = "warstudiosite";
export const TG_URL = `https://t.me/${TG_AGENT}`;
export const TG_HANDLE = `@${TG_AGENT}`;

/** Open Telegram in a new tab/app. Falls back to same-tab if popup blocked. */
export function openTelegram() {
  const w = window.open(TG_URL, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = TG_URL;
}
