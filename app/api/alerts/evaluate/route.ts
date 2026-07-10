import { NextResponse } from "next/server";
import { evaluateAlerts } from "@/lib/alerts/evaluator";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await evaluateAlerts();

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert evaluation error",
      },
      { status: 500 },
    );
  }
}
