import Redis from "ioredis";

/**
 * Shared lazy Redis connection for request-scoped features (rate limiting,
 * impersonation sessions). Lazy so importing a route does not open a socket at
 * build time; the first request connects.
 */
let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1500,
  });
  return client;
}
