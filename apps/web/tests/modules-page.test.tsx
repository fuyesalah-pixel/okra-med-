// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { ModuleCatalog } from "@/components/platform/modules/module-catalog";

/**
 * Break-it target: hardcode a module row inside the catalog and this fails —
 * both the row count and the names must come from the API payload.
 */

const MODULES = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    key: "registration",
    name: "Registration",
    description: "Front desk",
    descriptionLong: null,
    displayOrder: 1,
    isCore: true,
    isActive: true,
    pricing: {
      id: "price-1",
      instancePrice: 25000,
      currency: "ETB",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    key: "laboratory",
    name: "Laboratory",
    description: null,
    descriptionLong: null,
    displayOrder: 2,
    isCore: false,
    isActive: false,
    pricing: null,
  },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={client}>
        <ModuleCatalog />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: MODULES })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("module catalog rendering", () => {
  it("matches the API payload row for row", async () => {
    const { container } = renderPage();

    // Rendered twice on purpose: the table for desktop, cards for mobile.
    expect((await screen.findAllByText("Registration")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Laboratory").length).toBeGreaterThan(0);

    const bodyRows = container.querySelectorAll("table tbody tr");
    expect(bodyRows).toHaveLength(MODULES.length);

    // Price is formatted from the payload's minor units, not a constant.
    expect(screen.getAllByText("250.00 ETB").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No active price").length).toBeGreaterThan(0);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toBe(
      "/api/platform/modules",
    );
  });
});
