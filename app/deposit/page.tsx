import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Deposit screen — "/deposit" */
export const metadata: Metadata = {
  alternates: { canonical: "/deposit" },
  description: "Deposit to your 100LUCK wallet with bKash, Nagad or Rocket.", title: "Deposit · 100LUCK" };

export default function DepositPage() {
  return <ShellRoute tab="deposit" />;
}
