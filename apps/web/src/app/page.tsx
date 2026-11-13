import { QuantTerminal } from "@/components/QuantTerminal";
import type { TerminalOverview } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadInitialOverview(): Promise<TerminalOverview | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${apiUrl}/api/v1/terminal/overview`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as TerminalOverview;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const initialOverview = await loadInitialOverview();
  return <QuantTerminal initialOverview={initialOverview} />;
}
