/** Shared fetch wrapper for the platform admin pages (Prompt 4.4). */

type ErrorBody = { error?: { message?: string; code?: string } };

export class PlatformApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PlatformApiError";
  }
}

export async function platformRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = "/platform/login";
    throw new PlatformApiError("UNAUTHORIZED", 401, "UNAUTHORIZED");
  }

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Non-JSON error body; fall back to the status.
    }
    throw new PlatformApiError(
      body.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body.error?.code,
    );
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json()) as { data?: T };
  if (body.data === undefined) throw new PlatformApiError("Response did not include data", 500);
  return body.data;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
