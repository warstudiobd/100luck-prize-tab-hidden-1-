import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Profile tab — "/member" (the old Member centre grid + My Account screen, merged) */
export const metadata: Metadata = { title: "Profile · 100LUCK" };

export default function MemberPage() {
  return <ShellRoute tab="member" />;
}
