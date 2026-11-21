import { eq } from "drizzle-orm";
import { platformUsers } from "@okra-med/db";
import { getPlatformSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { platformDb } from "./db";

export type PlatformRole = "super_admin" | "platform_support";

export type PlatformActor = {
  actorId: string;
  email: string;
  role: PlatformRole;
};

/** Both platform roles can read the control plane; only super_admin can change the product. */
export const READ_ROLES: PlatformRole[] = ["super_admin", "platform_support"];
export const TENANT_ADMIN_ROLES: PlatformRole[] = ["super_admin", "platform_support"];
export const SUPER_ADMIN_ROLES: PlatformRole[] = ["super_admin"];

/**
 * Resolves the caller of a platform API request.
 *
 * The role is read from the database rather than trusted from the session
 * cookie: sessions live for 7 days, and a demoted or deactivated admin must
 * lose access immediately, not at next login.
 */
export async function requirePlatformRole(allowed: PlatformRole[]): Promise<PlatformActor> {
  const session = await getPlatformSession();
  if (!session?.user) throw new AppError("UNAUTHORIZED", "Authentication required", 401);

  const [user] = await platformDb()
    .select({ id: platformUsers.id, email: platformUsers.email, role: platformUsers.role, isActive: platformUsers.isActive })
    .from(platformUsers)
    .where(eq(platformUsers.id, session.user.id))
    .limit(1);

  if (!user || !user.isActive) throw new AppError("UNAUTHORIZED", "Account is not active", 401);
  if (!allowed.includes(user.role as PlatformRole)) {
    throw new AppError("FORBIDDEN", "Your role does not permit this action", 403);
  }

  return { actorId: user.id, email: user.email, role: user.role as PlatformRole };
}
