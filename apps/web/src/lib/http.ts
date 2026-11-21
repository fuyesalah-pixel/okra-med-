import { ZodError } from "zod";
import { AppError, toResponse } from "./errors";
import { logger } from "./logger";

export type RouteCtx<TParams extends Record<string, string>> = {
  requestId: string;
  params: TParams;
};

/**
 * Wraps a route handler with:
 *  - a per-request correlation id, echoed back as `x-request-id` (and written to
 *    every audit row this request produces)
 *  - `AppError` / `ZodError` -> JSON error envelopes
 *  - logging of unknown failures, without leaking internals to the caller
 *
 * Handlers return a `Response`; throw `AppError` for expected failures.
 */
/**
 * Next 15 validates the second route argument against its generated
 * `RouteContext` (`{ params: Promise<...> }`, never optional) whenever
 * `experimental.typedRoutes` is on, so the returned handler must declare it
 * required even for routes without dynamic segments.
 */
export function wrapRoute<TParams extends Record<string, string> = Record<string, string>>(
  handler: (req: Request, ctx: RouteCtx<TParams>) => Promise<Response>,
) {
  return async (req: Request, routeCtx: { params: Promise<TParams> }): Promise<Response> => {
    const incoming = req.headers.get("x-request-id");
    const requestId = incoming && incoming.length <= 63 ? incoming : crypto.randomUUID();
    const started = Date.now();

    let response: Response;
    try {
      const params = await routeCtx.params;
      response = await handler(req, { requestId, params });
    } catch (err) {
      response = errorResponse(err);
    }

    response.headers.set("x-request-id", requestId);
    if (response.status >= 500) {
      logger.error(
        { requestId, method: req.method, url: req.url, ms: Date.now() - started },
        "request failed",
      );
    }
    return response;
  };
}

function errorResponse(err: unknown): Response {
  if (err instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION",
          message: "Request body failed validation",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  if (err instanceof AppError) return toResponse(err);
  return toResponse(err);
}

/** Client address + user agent, for audit rows. Behind a proxy, `x-forwarded-for` wins. */
export function requestMeta(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : (req.headers.get("x-real-ip") ?? undefined);
  return { ip, userAgent: req.headers.get("user-agent") ?? undefined };
}

/** Parses a JSON body, rejecting non-JSON with a 400 rather than a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
}

/** Same, but an absent or empty body is `{}` — for endpoints whose body is optional. */
export async function readOptionalJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
}
