import { getPlatformSession } from "@/lib/auth/session";
export default async function PlatformDashboard() {
  const session = await getPlatformSession();
  return <div className="p-8"><h1 className="text-2xl font-bold">Platform Dashboard</h1><p>Hello, {session?.user?.name ?? "Guest"}</p></div>;
}
