import type { Metadata } from "next";
import Link from "next/link";

import { DeleteAccountFlow } from "./delete-account-flow";

export const metadata: Metadata = {
  title: "Delete Account — Prangan",
  description: "Verify your identity and permanently delete your Prangan account.",
};

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline hover:underline">
        ← Back
      </Link>

      <div className="mt-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Delete your account</h1>
        <p className="text-sm text-muted-foreground">
          Deleting your account removes your profile, credentials, and personal data. To protect you,
          we verify it&apos;s really you with a one-time code before anything is deleted.
        </p>
      </div>

      <div className="mt-8">
        <DeleteAccountFlow />
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Some records may be retained where required by law. See our{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>{" "}
        or{" "}
        <Link href="/help" className="underline underline-offset-4">
          Help &amp; Support
        </Link>
        .
      </p>
    </main>
  );
}
