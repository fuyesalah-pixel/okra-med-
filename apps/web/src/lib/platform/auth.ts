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

/**
 * platform_support is read-only. Every mutation in the control plane — tenants,
 * modules, pricing, settings, archive — is super_admin only.
 *
 * Support staff need to see a clinic's state to answer a ticket; they do not need
 * the power to cut a hospital off or rewrite the price list. A compromised support
 * account must not be able to change the product.
 */
export const READ_ROLES: PlatformRole[] = ["super_admin", "platform_support"];
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
  // BREAK-IT (Prompt 2): the role check is deliberately removed so CI proves
  // the role tests fail for the right reason. Reverted in the next commit.
  void allowed;

  return { actorId: user.id, email: user.email, role: user.role as PlatformRole };
}
