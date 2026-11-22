import { redirect } from "next/navigation";
import { getPlatformSession } from "@/lib/auth/session";
import { READ_ROLES, requirePlatformRole } from "@/lib/platform/auth";
import { PlatformProviders } from "@/components/platform/providers";
import { PlatformShell, type PlatformUser } from "@/components/platform/platform-shell";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();
  if (!session?.user) redirect("/platform/login");

  // The session user is Better Auth's default shape and does not carry the
  // custom `role` column, so read it from the database through the same guard
  // the APIs use. A demoted admin loses the correct badge immediately.
  const actor = await requirePlatformRole(READ_ROLES);

  const user: PlatformUser = {
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: actor.role,
  };

  return (
    <PlatformProviders>
      <PlatformShell user={user}>{children}</PlatformShell>
    </PlatformProviders>
  );
}
