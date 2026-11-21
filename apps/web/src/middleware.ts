import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const RESERVED = new Set(["platform", "api", "www", "app", "admin", "login", "signup"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const res = NextResponse.next();
  if (segments.length > 0 && !RESERVED.has(segments[0]) && !pathname.startsWith("/api")) {
    res.headers.set("x-tenant-slug", segments[0]);
  }
  // correlation id
  res.headers.set("x-request-id", crypto.randomUUID());
  return res;
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
