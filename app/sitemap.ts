import type { MetadataRoute } from "next";
import { CANONICAL_SITE_URL } from "@/lib/site-url";

/**
 * /sitemap.xml — v55. Only the public, crawlable screens are listed; the
 * private ones (/member, /deposit, /withdraw, /play/*) are disallowed in
 * robots.txt and would only add noise here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly"): MetadataRoute.Sitemap[number] => ({
    url: `${CANONICAL_SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });
  return [
    page("/", 1.0, "daily"),
    page("/promotion", 0.9, "daily"),
    page("/prizes", 0.8, "daily"),
    page("/member/support", 0.4, "monthly"),
  ];
}
