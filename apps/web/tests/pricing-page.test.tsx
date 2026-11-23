// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { PricingTable } from "@/components/platform/pricing/pricing-table";

/**
 * Break-it target: hardcode a price on the page and this goes red. The rendered
 * amount is derived from the API's minor units (123400 -> 1,234.00 ETB).
 */

const MODULES = [
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    key: "pharmacy",
    name: "Pharmacy",
    description: null,
    descriptionLong: null,
    displayOrder: 1,
    isCore: false,
    isActive: true,
    pricing: {
      id: "price-pharmacy",
      instancePrice: 123400,
      currency: "ETB",
      updatedAt: "2026-11-10T09:30:00.000Z",
    },
  },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={client}>
        <PricingTable />
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

describe("pricing table rendering", () => {
  it("shows the price and last-updated date from the API", async () => {
    const { container } = renderPage();

    expect((await screen.findAllByText("Pharmacy")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,234.00 ETB").length).toBeGreaterThan(0);
    // Desktop table + mobile card both render the date.
    expect(screen.getAllByText("10 Nov 2026, 09:30").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(MODULES.length);
  });
});
