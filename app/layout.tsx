import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenCEA Dashboard",
  description: "Dashboard for reported_state device telemetry for CEA container farms",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
