import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reported State Dashboard",
  description: "Dashboard for reported_state device telemetry",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
