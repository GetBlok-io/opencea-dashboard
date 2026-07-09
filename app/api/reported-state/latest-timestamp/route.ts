import { NextResponse } from "next/server";
import { resolveFarmSelection } from "@/lib/farms";
import { getLatestReportedStateScrapedAt } from "@/lib/reportedState";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const selection = await resolveFarmSelection(searchParams.get("controller_id") ?? searchParams.get("farm"));
    const latestScrapedAt = await getLatestReportedStateScrapedAt(selection);

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      selected_farm: selection,
      latest_scraped_at: latestScrapedAt,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
