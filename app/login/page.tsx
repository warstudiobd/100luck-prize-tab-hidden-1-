/**
 * /login — the old deep link.
 *
 * The whole app is a single page (app/page.tsx) and sign-in happens in an
 * overlay, so nobody was ever meant to land on a real /login route. But that URL
 * had been shared and bookmarked, and it returned Next's bare "404 This page
 * could not be found" — which reads as a dead site. Sending people to the home
 * screen (where the login button lives) costs nothing and removes that trap.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
/* a redirect is not a landing page — keep it out of the index */
export const metadata: Metadata = { robots: { index: false, follow: true }, alternates: { canonical: "/" } };

export default function LoginRedirect() {
  redirect("/?login=1");
}
