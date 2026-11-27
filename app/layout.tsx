import type { Metadata, Viewport } from "next";
import { CANONICAL_SITE_URL } from "@/lib/site-url";
import "./globals.css";

const SITE = CANONICAL_SITE_URL;
const TITLE = "100LUCK · ১০০ লাক — Online Casino Bangladesh | অনলাইন ক্যাসিনো";
const DESC =
  "100LUCK (১০০ লাক) — Bangladesh's online casino. JILI, Fa Chai, Aviator slots, live casino, bKash/Nagad/Rocket deposits. বাংলাদেশের অনলাইন ক্যাসিনো — স্লট, লাইভ ক্যাসিনো ও বিকাশ/নগদ/রকেট ডিপোজিট।";

/**
 * v55 SEO pass. The page previously shipped NO canonical, NO Open Graph tags and
 * NO structured data, and /robots.txt + /sitemap.xml were 404 — a crawler had
 * nothing to anchor the site on. Everything below is emitted on every route.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "100LUCK",
    url: SITE,
    title: TITLE,
    description: DESC,
    locale: "bn_BD",
    alternateLocale: ["en_US"],
    images: [{ url: "/brand/logo.png", width: 800, height: 622, alt: "100LUCK" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/brand/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  title: TITLE,
  description: DESC,
  keywords: ["online casino bangladesh", "bKash casino", "JILI", "Aviator", "অনলাইন ক্যাসিনো", "স্লট", "১০০ লাক", "100luck", "100luckcasino", "luck casino"],
  manifest: "/manifest.json",
  /**
   * Google Search Console — HTML-tag verification. The same token is already in
   * the domain's DNS as a TXT record, but that record was entered twice in one
   * value (the token is duplicated), which Google cannot match. This <meta> tag
   * is the second, independent proof of ownership, so the property verifies
   * either way.
   */
  verification: { google: "QkPI25w0vr2bcTtCSnAiFwFIKcBYX9aTBqo0yB34FW0" },
  applicationName: "100LUCK",
  appleWebApp: { capable: true, title: "100LUCK", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/brand/app/icon-192.png", sizes: "192x192", type: "image/png" },
           { url: "/brand/app/icon-512.png", sizes: "512x512", type: "image/png" },
           { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
    apple: [{ url: "/brand/apple-icon.png", sizes: "180x180" }],
  },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false,
  themeColor: "#121212",
  /* keeps the app drawing under the status bar when it runs as an installed app */
  viewportFit: "cover",
};
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "100LUCK",
      alternateName: ["১০০ লাক", "100LUCK Casino", "100luckcasino"],
      url: SITE,
      logo: `${SITE}/brand/logo.png`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "100LUCK",
      inLanguage: ["bn-BD", "en"],
      publisher: { "@id": `${SITE}/#org` },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn">
      <body className="antialiased">
        <script
          type="application/ld+json"
          /* structure, not user input — serialised straight from the object above */
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
      </body>
    </html>
  );
}
