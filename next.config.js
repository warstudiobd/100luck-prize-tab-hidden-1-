/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Game thumbnails come from provider CDNs: mostly 512x512 PNGs that weigh up to
  // ~700 KB but render in a ~115 px tile. Serving them through the image optimiser
  // converts them to right-sized WebP at a fraction of the bytes.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.imagesai.org" },
      { protocol: "https", hostname: "**.imagesai.org" },
      { protocol: "https", hostname: "**.hub-x.net" },
      { protocol: "https", hostname: "**.softaggregator.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
    formats: ["image/webp"],
    /* thumbnails never need more than a tile: cut the optimiser's cache footprint and
       keep every variant it generates small */
    deviceSizes: [360, 414, 480, 640, 828, 1080, 1200],
    imageSizes: [96, 128, 160, 192, 256, 320, 384],
    minimumCacheTTL: 604800,
  },
  async headers() {
    return [
      { source: "/api/wallet/callback", headers: [{ key: "Cache-Control", value: "no-store" }] },
      /* Pre-generated game thumbnails never change for a given game_code: let the
         browser and Vercel's CDN keep them for a year so a returning player pays
         nothing for the lobby art. */
      {
        source: "/thumbs/games/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      /* The HTML document must never be served stale.
       *
       * Each deploy publishes new chunk filenames. If a player's browser (or a CDN edge)
       * keeps yesterday's HTML, that HTML asks for chunk files that no longer exist, and
       * the page dies with "page couldn't load" — the classic post-deploy symptom.
       * no-store here forces the document back to the network so it always points at
       * chunks that actually exist for the current deployment. Hashed assets under
       * /_next/static stay immutable and cached, so this costs returning players nothing.
       */
      {
        source: "/:path*",
        has: [{ type: "header", key: "accept", value: ".*text/html.*" }],
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Accel-Buffering", value: "no" },
        ],
      },
    ];
  },
  // 499bet-style /m/* mobile routes → the real screens (each screen is its own URL now)
  async redirects() {
    return [
      { source: "/m", destination: "/", permanent: false },
      { source: "/m/home", destination: "/", permanent: false },
      { source: "/m/deposit", destination: "/deposit", permanent: false },
      { source: "/m/withdraw", destination: "/withdraw", permanent: false },
      { source: "/m/promotion", destination: "/promotion", permanent: false },
      { source: "/m/member", destination: "/member", permanent: false },
      // Older shared links used ?tab=… on the home page; keep them working.
      { source: "/", has: [{ type: "query", key: "tab", value: "deposit" }], destination: "/deposit", permanent: false },
      { source: "/", has: [{ type: "query", key: "tab", value: "withdraw" }], destination: "/withdraw", permanent: false },
      { source: "/", has: [{ type: "query", key: "tab", value: "promo" }], destination: "/promotion", permanent: false },
      { source: "/", has: [{ type: "query", key: "tab", value: "promotion" }], destination: "/promotion", permanent: false },
      { source: "/", has: [{ type: "query", key: "tab", value: "member" }], destination: "/member", permanent: false },
      { source: "/promo", destination: "/promotion", permanent: false },
      /* ── the previous occupant of this domain ────────────────────────────────
         warstudio.site used to host "LotChat" (a social voice-room app), and
         Bing/DuckDuckGo still list its /auth/login page — with a LotChat title —
         as the best match for this domain. That URL 404s today, so a visitor
         (and the crawler) landed on a dead page carrying someone else's brand.
         These are permanent redirects: they retire the stale URL, move any
         inherited ranking signal to the live site, and the crawler replaces the
         old entry instead of retrying it. */
      { source: "/auth/login", destination: "/", permanent: true },
      { source: "/auth/register", destination: "/", permanent: true },
      { source: "/auth/:path*", destination: "/", permanent: true },
      { source: "/login", destination: "/?login=1", permanent: true },
      { source: "/register", destination: "/?login=1", permanent: true },
      { source: "/signin", destination: "/?login=1", permanent: true },
      { source: "/signup", destination: "/?login=1", permanent: true },
      { source: "/voice-rooms", destination: "/", permanent: true },
      { source: "/voice-room/:path*", destination: "/", permanent: true },
      { source: "/rooms", destination: "/", permanent: true },
      { source: "/lotchat", destination: "/", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/welcome", destination: "/", permanent: true },
      { source: "/about", destination: "/", permanent: true },
      { source: "/privacy", destination: "/", permanent: true },
      { source: "/terms", destination: "/", permanent: true },
    ];
  },
};
module.exports = nextConfig;
