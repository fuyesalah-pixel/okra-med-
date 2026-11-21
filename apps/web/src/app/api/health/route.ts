import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "@okra-med/db";
import Redis from "ioredis";

/**
 * Liveness + dependency probe used by:
 *   - the Dockerfile HEALTHCHECK
 *   - /opt/okra-med/deploy.sh
 *   - the Deploy workflow's post-deploy curl
 *
 * Two bugs lived here before. The route was at `api/_health`, and App Router
 * treats `_`-prefixed folders as private — the endpoint was never routed, so the
 * production build answered 404 and no deploy gate could ever pass. And it
 * returned `{db:"ok", redis:"ok"}` as literals, so even had it been routed it
 * would have reported healthy with both dependencies down.
 */
const started = Date.now();

let db: Db | null = null;
let redis: Redis | null = null;

function getDb(): Db {
  db ??= createDb(process.env.DATABASE_URL!);
  return db;
}

function getRedis(): Redis {
  redis ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
  });
  return redis;
}

async function checkDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    if (getRedis().status === "wait") await getRedis().connect();
    return (await getRedis().ping()) === "PONG";
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
  const ok = dbOk && redisOk;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      db: dbOk ? "ok" : "down",
      redis: redisOk ? "ok" : "down",
      version: "0.1.0",
      uptime: Math.floor((Date.now() - started) / 1000),
    },
    { status: ok ? 200 : 503 },
  );
}
