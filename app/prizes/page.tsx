import { redirect } from "next/navigation";

/** Prize tab temporarily hidden; keep the route reversible and redirect to Promotions. */
export default function PrizesPage() { redirect("/promotion"); }
