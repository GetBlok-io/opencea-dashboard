import { NextResponse } from "next/server";
import { getReportedStateHistory } from "@/lib/reportedStateHistory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = Number(searchParams.get("hours") ?? "24");
    const rows = await getReportedStateHistory(hours);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      generated_at: new Date().toISOString(),
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
