import type {
  ModuleCatalogItem,
  TenantAuditData,
  TenantDetailData,
  TenantListData,
  TenantSettings,
} from "./tenant-types";

type ErrorBody = { error?: { message?: string; code?: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = "/platform/login";
    throw new Error("UNAUTHORIZED");
  }

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Non-JSON error body; fall through to the status message.
    }
    throw new Error(body.error?.message ?? `Request failed with status ${res.status}`);
  }

  const body = (await res.json()) as { data?: T };
  if (body.data === undefined) throw new Error("Response did not include data");
  return body.data;
}

export function fetchTenants(params: {
  search: string;
  status: string;
  sort: string;
  page: number;
  pageSize: number;
}): Promise<TenantListData> {
  const query = new URLSearchParams();
  if (params.search.trim()) query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);
  query.set("sort", params.sort);
  query.set("limit", String(params.pageSize));
  query.set("offset", String(params.page * params.pageSize));
  return request<TenantListData>(`/api/platform/tenants?${query.toString()}`);
}

export function fetchTenant(id: string): Promise<TenantDetailData> {
  return request<TenantDetailData>(`/api/platform/tenants/${id}`);
}

export function fetchModules(): Promise<ModuleCatalogItem[]> {
  return request<ModuleCatalogItem[]>("/api/platform/modules");
}

export function fetchTenantAudit(
  id: string,
  params: { from?: string; to?: string; action?: string; limit?: number; offset?: number },
): Promise<TenantAuditData> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.action) query.set("action", params.action);
  query.set("limit", String(params.limit ?? 50));
  query.set("offset", String(params.offset ?? 0));
  return request<TenantAuditData>(`/api/platform/tenants/${id}/audit?${query.toString()}`);
}

export function updateTenantSettings(
  id: string,
  input: Partial<TenantSettings> & {
    contactEmail?: string | null;
    contactPhone?: string | null;
    country?: string;
    notes?: string | null;
  },
): Promise<{ tenant: unknown; settings: TenantSettings }> {
  return request(`/api/platform/tenants/${id}/settings`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function suspendTenant(id: string, reason: string) {
  return request(`/api/platform/tenants/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function archiveTenant(id: string, reason: string) {
  return request(`/api/platform/tenants/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reactivateTenant(id: string) {
  return request(`/api/platform/tenants/${id}/reactivate`, { method: "POST" });
}

export function subscriptionAction(id: string, action: "renew" | "cancel") {
  return request(`/api/platform/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ action }),
  });
}

export function replaceSubscriptionModules(id: string, modules: { key: string; count: number }[]) {
  return request(`/api/platform/subscriptions/${id}/modules`, {
    method: "PATCH",
    body: JSON.stringify({ modules }),
  });
}

export function impersonate(id: string, userId: string) {
  return request<{ token: string; expiresAt: string }>(`/api/platform/tenants/${id}/impersonate`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}
