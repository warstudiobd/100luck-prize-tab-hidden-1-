import type { MetadataRoute } from "next";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * /robots.txt — v55.
 *
 * Before this file existed Google got a 404 for robots.txt: it had no crawl
 * rules AND no sitemap pointer, which is one of the reasons the site was not
 * being discovered. Signed-in screens are excluded so the crawler spends its
 * budget on the public pages instead of on member/ticket screens.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/member",          // signed-in profile, tickets, ledger
          "/withdraw",        // cashier — provider-only
          "/deposit",
          "/play/",           // game launcher frames
        ],
      },
      { userAgent: "Googlebot-Image", allow: "/brand/" },
    ],
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
    host: CANONICAL_SITE_URL,
  };
}
