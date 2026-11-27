import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Bind a withdrawal wallet — "/withdraw/bind" */
export const metadata: Metadata = { title: "Bind account · 100LUCK" };

export default function WithdrawBindPage() {
  return <ShellRoute tab="withdraw" />;
}
