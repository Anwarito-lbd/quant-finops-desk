import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quant & FinOps Desk — Multi-Strategy Risk & Corporate Valuation Terminal",
  description:
    "Unified Markowitz/CVaR optimization, Regime-Switching Monte Carlo stress testing, 5-repo trading adapter hub, and SaaS Cohorts + 5-Year DCF valuation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased selection:bg-sky-500/30">{children}</body>
    </html>
  );
}
