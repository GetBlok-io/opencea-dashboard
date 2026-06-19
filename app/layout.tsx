import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmhand Dashboard",
  description: "Dashboard for farmhand reported_state device telemetry",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
