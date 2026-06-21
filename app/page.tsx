import Dashboard from "@/components/Dashboard";
import { listFarmOptions, resolveFarmSelection } from "@/lib/farms";
import { getLatestReportedState } from "@/lib/reportedState";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type HomeProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await Promise.resolve(searchParams ?? {});
  const requestedControllerId = firstParam(params.controller_id) ?? firstParam(params.farm);
  const selection = await resolveFarmSelection(requestedControllerId);
  const [rows, farmOptions] = await Promise.all([
    getLatestReportedState(selection),
    listFarmOptions(),
  ]);

  return (
    <Dashboard
      initialRows={rows}
      farmOptions={farmOptions}
      selectedControllerId={selection.controllerId}
    />
  );
}
