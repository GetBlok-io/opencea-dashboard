import Dashboard from "@/components/Dashboard";
import { getLatestReportedState } from "@/lib/reportedState";

export const dynamic = "force-dynamic";

export default async function Home() {
  const rows = await getLatestReportedState();
  return <Dashboard initialRows={rows} />;
}
