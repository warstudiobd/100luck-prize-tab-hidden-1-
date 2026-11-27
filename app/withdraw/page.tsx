import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Withdraw screen — "/withdraw" */
export const metadata: Metadata = {
  alternates: { canonical: "/withdraw" },
  description: "Withdraw from your 100LUCK wallet to bKash, Nagad or Rocket.", title: "Withdraw · 100LUCK" };

export default function WithdrawPage() {
  return <ShellRoute tab="withdraw" />;
}
