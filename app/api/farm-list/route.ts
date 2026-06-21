import { NextResponse } from "next/server";
import { listFarmOptions } from "@/lib/farms";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const farms = await listFarmOptions();
    return NextResponse.json({ ok: true, generated_at: new Date().toISOString(), count: farms.length, farms });
  } catch (error) {
    return NextResponse.json(
      { ok: false, generated_at: new Date().toISOString(), error: error instanceof Error ? error.message : "Unknown farm list API error" },
      { status: 500 }
    );
  }
}
