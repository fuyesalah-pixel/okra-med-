import { AppError, toResponse } from "@/lib/errors";
export async function GET() {
  throw new AppError("DEMO_ERROR", "Demo error", 400);
}
export { toResponse as POST };
