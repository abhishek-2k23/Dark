// Client-side calls to the API's REST (OpenAPI) surface. `NEXT_PUBLIC_API_URL`
// may point at the tRPC endpoint (…/trpc) for other consumers, so we normalize
// it to the origin and append the REST path ourselves. Defaults to the local
// API dev server.
function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return raw.replace(/\/(trpc|api)\/?$/, "").replace(/\/+$/, "");
}

export type RequestDeletionResult =
  | { status: "OTP_SENT"; devCode?: string }
  | { status: "DEMO_BLOCKED" };

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { message?: string }).message ?? "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

/** Ask the API to email an account-deletion code (or refuse a demo account). */
export function requestAccountDeletion(email: string) {
  return post<RequestDeletionResult>("/api/v1/account/deletion/request", { email });
}

/** Confirm the emailed code and delete the account. */
export function confirmAccountDeletion(email: string, code: string) {
  return post<{ success: true }>("/api/v1/account/deletion/confirm", { email, code });
}
