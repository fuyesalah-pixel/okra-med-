export class AppError extends Error {
  constructor(public code: string, message: string, public httpStatus = 400) { super(message); }
}
export function toResponse(err: unknown) {
  if (err instanceof AppError) return Response.json({ error: { code: err.code, message: err.message } }, { status: err.httpStatus });
  return Response.json({ error: { code: "INTERNAL", message: "Internal server error" } }, { status: 500 });
}
