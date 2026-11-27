import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Withdrawal records — "/withdraw/records" */
export const metadata: Metadata = { title: "Withdraw records · 100LUCK" };

export default function WithdrawRecordsPage() {
  return <ShellRoute tab="withdraw" />;
}
