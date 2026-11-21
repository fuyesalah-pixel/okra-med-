import { pino } from "pino";

// JSON in every environment. The previous `pino-pretty` transport is not a
// dependency, so it threw on first use in development and would have taken the
// platform API down with it. Pipe through `pino-pretty` at the shell instead:
//   pnpm dev | pnpm exec pino-pretty
// (Adding `LOG_PRETTY` and the devDependency is fine later; logging must not be
// able to crash request handling.)
export const logger = pino({ level: process.env.NODE_ENV === "production" ? "info" : "debug" });
