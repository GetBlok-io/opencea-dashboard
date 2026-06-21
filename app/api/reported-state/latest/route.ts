import { NextResponse } from "next/server";
import { getLatestReportedState } from "@/lib/reportedState";
import { resolveFarmSelection } from "@/lib/farms";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selection = await resolveFarmSelection(searchParams.get("controller_id") ?? searchParams.get("farm"));
    const rows = await getLatestReportedState(selection);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      generated_at: new Date().toISOString(),
      selected_farm: selection,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
