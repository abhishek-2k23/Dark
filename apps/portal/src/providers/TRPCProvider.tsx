import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";

import { makeTRPCClient, trpc } from "@/lib/trpc";

/** Provides the tRPC + react-query context to the whole app. */
export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
        },
      }),
  );
  const [client] = useState(() => makeTRPCClient());

  // React-query only knows about browser focus. Feed it the native app state so
  // returning to the foreground refetches whatever went stale while the app was
  // backgrounded — an approval or ticket update shows up without a restart.
  useEffect(() => {
    if (Platform.OS === "web") return; // browser focus already handled
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  return (
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
