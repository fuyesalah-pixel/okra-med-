import type { DashboardData } from "./dashboard-types";

export async function fetchDashboard(): Promise<DashboardData> {
  const res = await fetch("/api/platform/dashboard", {
    headers: { accept: "application/json" },
  });

  if (res.status === 401) {
    window.location.href = "/platform/login";
    throw new Error("UNAUTHORIZED");
  }

  if (!res.ok) {
    throw new Error(`Dashboard request failed with status ${res.status}`);
  }

  const body = (await res.json()) as { data?: DashboardData };
  if (!body.data) throw new Error("Dashboard response did not include data");
  return body.data;
}
