import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const EventActionSchema = z.object({
  action: z.enum(["acknowledge", "resolve", "suppress", "unsuppress"]),
  suppress_minutes: z.number().int().positive().max(60 * 24 * 30).optional(),
});

const eventReturnSql = `
  id::text,
  alert_rule_id::text,
  farm_controller_id::text,
  status,
  first_triggered_at,
  last_triggered_at,
  active_at,
  resolved_at,
  acknowledged_at,
  suppressed_until,
  latest_value,
  context_json,
  created_at,
  updated_at
`;

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = EventActionSchema.parse(await request.json());

    let result;

    if (body.action === "acknowledge") {
      result = await pool.query(
        `
          UPDATE alert_events
          SET
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
          RETURNING ${eventReturnSql};
        `,
        [id],
      );
    } else if (body.action === "resolve") {
      result = await pool.query(
        `
          UPDATE alert_events
          SET
            status = 'resolved',
            resolved_at = COALESCE(resolved_at, NOW()),
            suppressed_until = NULL,
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
            AND status IN ('pending', 'active', 'suppressed')
          RETURNING ${eventReturnSql};
        `,
        [id],
      );
    } else if (body.action === "suppress") {
      const suppressMinutes = body.suppress_minutes ?? 60;

      result = await pool.query(
        `
          UPDATE alert_events
          SET
            status = 'suppressed',
            suppressed_until = NOW() + ($2::int * INTERVAL '1 minute'),
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
            AND status IN ('pending', 'active', 'suppressed')
          RETURNING ${eventReturnSql};
        `,
        [id, suppressMinutes],
      );
    } else {
      result = await pool.query(
        `
          UPDATE alert_events
          SET
            status = 'active',
            active_at = COALESCE(active_at, NOW()),
            suppressed_until = NULL,
            resolved_at = NULL,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'suppressed'
          RETURNING ${eventReturnSql};
        `,
        [id],
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Alert event not found or action not allowed" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown alert event action error",
      },
      { status: 400 },
    );
  }
}
