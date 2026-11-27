import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** সাপোর্ট — support section, "/member/support" */
export const metadata: Metadata = { title: "সাপোর্ট · Support · 100LUCK" };

export default function SupportPage() {
  return <ShellRoute tab="member" />;
}
