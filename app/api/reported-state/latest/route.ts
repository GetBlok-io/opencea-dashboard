import { NextResponse } from "next/server";
import { getLatestReportedState } from "@/lib/reportedState";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getLatestReportedState();

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
