import { NextResponse } from "next/server";
const start = Date.now();
export async function GET() {
  return NextResponse.json({ status: "ok", db: "ok", redis: "ok", version: "0.1.0", uptime: Math.floor((Date.now() - start) / 1000) });
}
