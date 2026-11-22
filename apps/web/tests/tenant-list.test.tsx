// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { TenantList } from "@/components/platform/tenants/tenant-list";

/**
 * Renders the real list against a mocked HTTP layer. The point is the count and
 * row count must come from the API payload: hardcoding either inside the list
 * makes this fail.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const TENANTS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "alpha-clinic",
    name: "Alpha Clinic",
    status: "trial",
    contactEmail: "alpha@clinic.test",
    trialEndsAt: null,
    subscriptionEndsAt: null,
    suspendedReason: null,
    provisionedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    moduleCount: 3,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    slug: "beta-clinic",
    name: "Beta Clinic",
    status: "active",
    contactEmail: null,
    trialEndsAt: null,
    subscriptionEndsAt: null,
    suspendedReason: null,
    provisionedAt: null,
    createdAt: "2026-11-02T00:00:00.000Z",
    moduleCount: 1,
  },
];

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={client}>
        <TenantList />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: { items: TENANTS, total: TENANTS.length, limit: 20, offset: 0 },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tenant list rendering", () => {
  it("renders one row per API item and reports the API total", async () => {
    const { container } = renderList();

    await screen.findByText("Alpha Clinic");
    await screen.findByText("Beta Clinic");

    const bodyRows = container.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(TENANTS.length);
    expect(screen.getByText(/2 tenants/)).toBeTruthy();

    // Filters must reach the API rather than being applied to a local constant.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const calledUrl = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/platform/tenants?");
    expect(calledUrl).toContain("limit=20");
  });
});
