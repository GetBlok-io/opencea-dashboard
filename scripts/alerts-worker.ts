import "tsconfig-paths/register";
import { createRequire } from "node:module";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const require = createRequire(import.meta.url);
const PgBossModule = require("pg-boss");
const PgBoss =
  PgBossModule?.PgBoss ??
  PgBossModule?.default ??
  PgBossModule;

if (typeof PgBoss !== "function") {
  console.error("[alerts-worker] Unsupported pg-boss export shape:", {
    moduleType: typeof PgBossModule,
    moduleKeys: Object.keys(PgBossModule ?? {}),
    defaultType: typeof PgBossModule?.default,
    pgBossType: typeof PgBossModule?.PgBoss,
  });

  throw new Error("Could not resolve pg-boss constructor.");
}

const JOB_NAME = "alerts-evaluate";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to start alerts worker.");
}

const boss = new PgBoss({
  connectionString,
});

let isEvaluating = false;

async function main() {
  const { evaluateAlerts } = await import("../lib/alerts/evaluator");

  boss.on("error", (error) => {
    console.error("[alerts-worker] pg-boss error:", error);
  });

  await boss.start();

  await boss.createQueue(JOB_NAME);

  await boss.work(JOB_NAME, async (job) => {
    if (isEvaluating) {
      console.log("[alerts-worker] Skipping overlapping evaluation job", job.id);
      return;
    }

    isEvaluating = true;

    try {
      const startedAt = new Date();
      const result = await evaluateAlerts();

      console.log("[alerts-worker] Alert evaluation complete", {
  	jobId: job?.id,
  	startedAt: startedAt.toISOString(),
  	finishedAt: new Date().toISOString(),
  	evaluated: result.evaluated,
  	results: result.results,
	});
    } catch (error) {
      console.error("[alerts-worker] Alert evaluation failed:", error);
      throw error;
    } finally {
      isEvaluating = false;
    }
  });

  await boss.schedule(JOB_NAME, "*/1 * * * *", {
    source: "pg-boss-schedule",
  });

  await boss.send(JOB_NAME, {
    source: "worker-startup",
  });

  console.log("[alerts-worker] Started. Evaluating alerts every 1 minute.");
}

async function shutdown(signal: string) {
  console.log(`[alerts-worker] Received ${signal}. Stopping...`);

  try {
    await boss.stop();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void main().catch((error) => {
  console.error("[alerts-worker] Fatal startup error:", error);
  process.exit(1);
});
