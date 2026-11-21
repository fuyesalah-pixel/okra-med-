import { AppError } from "@/lib/errors";
import { readJson, requestMeta, wrapRoute } from "@/lib/http";
import { quoteSchema } from "@/lib/platform/schemas";
import { getRedis } from "@/lib/redis";
import { computeQuote } from "@/lib/subscription/engine";

export const dynamic = "force-dynamic";

/**
 * Public price calculator. No auth on purpose — this is how a prospective
 * clinic sees the price before signing up. Because it is public, it is the one
 * platform-shaped endpoint that can be abused, so it is rate limited per IP.
 */
const LIMIT = 30;
const WINDOW_SECONDS = 60;

async function overLimit(ip: string): Promise<boolean> {
  const redis = getRedis();
  if (redis.status === "wait") await redis.connect();
  const key = `ratelimit:quote:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, WINDOW_SECONDS);
  return count > LIMIT;
}

export const POST = wrapRoute(async (req) => {
  const { ip } = requestMeta(req);
  if (await overLimit(ip ?? "unknown")) {
    throw new AppError("RATE_LIMITED", `Too many quote requests. Retry in ${WINDOW_SECONDS}s.`, 429);
  }

  const input = quoteSchema.parse(await readJson(req));
  return Response.json({ data: await computeQuote(input) });
});
