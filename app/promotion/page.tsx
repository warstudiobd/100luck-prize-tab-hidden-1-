import type { Metadata } from "next";
import { ShellRoute } from "@/components/AppShell";

/** Promotion / bonus screen — "/promotion" */
export const metadata: Metadata = {
  alternates: { canonical: "/promotion" },
  description: "Promotions &amp; bonus offers at 100LUCK — free spin, cashback and referral rewards.", title: "Promotion · 100LUCK" };

export default function PromotionPage() {
  return <ShellRoute tab="promo" />;
}
