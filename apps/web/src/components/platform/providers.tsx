"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: true },
    },
  });
}

export function PlatformProviders({ children }: { children: React.ReactNode }) {
  // useState keeps one client per browser session; a new QueryClient on every
  // render would drop the cache and refetch on every state change.
  const [queryClient] = useState(makeQueryClient);

  return (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}
