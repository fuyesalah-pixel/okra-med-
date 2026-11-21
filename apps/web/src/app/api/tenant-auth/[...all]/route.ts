import { toNextJsHandler } from "better-auth/next-js";
import { tenantAuth } from "@/lib/auth/auth.tenant";
export const { GET, POST } = toNextJsHandler(tenantAuth);
