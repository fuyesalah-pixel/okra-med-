// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { PlatformSettingsForm } from "@/components/platform/settings/platform-settings-form";

/**
 * Break-it target: hardcode a settings value in the form and this goes red.
 * Every field below is loaded from the API's key/value rows.
 */

const SETTINGS = [
  { key: "base_fee", value: 75000, description: null, updatedAt: "2026-11-20T10:00:00.000Z", updatedBy: "u1", updatedByName: "Ada Admin", updatedByEmail: "ada@okramed.local" },
  { key: "trial_days", value: 45, description: null, updatedAt: "2026-11-19T10:00:00.000Z", updatedBy: null, updatedByName: null, updatedByEmail: null },
  { key: "default_currency", value: "USD", description: null, updatedAt: "2026-11-18T10:00:00.000Z", updatedBy: null, updatedByName: null, updatedByEmail: null },
  { key: "supported_currencies", value: ["USD", "EUR"], description: null, updatedAt: "2026-11-17T10:00:00.000Z", updatedBy: null, updatedByName: null, updatedByEmail: null },
  { key: "platform_name", value: "Clinic Cloud", description: null, updatedAt: "2026-11-16T10:00:00.000Z", updatedBy: null, updatedByName: null, updatedByEmail: null },
  { key: "support_email", value: "help@cliniccloud.test", description: null, updatedAt: "2026-11-15T10:00:00.000Z", updatedBy: null, updatedByName: null, updatedByEmail: null },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={client}>
        <PlatformSettingsForm />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: SETTINGS })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("platform settings form", () => {
  it("renders the values the API returned", async () => {
    renderPage();

    const trialDays = (await screen.findByLabelText(/Trial length/)) as HTMLInputElement;
    await waitFor(() => expect(trialDays.value).toBe("45"));

    expect((screen.getByLabelText(/Base fee/) as HTMLInputElement).value).toBe("750");
    expect((screen.getByLabelText(/Platform name/) as HTMLInputElement).value).toBe("Clinic Cloud");
    expect((screen.getByLabelText(/Support email/) as HTMLInputElement).value).toBe(
      "help@cliniccloud.test",
    );
    expect((screen.getByLabelText(/Default currency/) as HTMLSelectElement).value).toBe("USD");
    expect(screen.getByText(/Ada Admin/)).toBeTruthy();
  });
});
