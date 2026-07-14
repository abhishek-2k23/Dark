import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete Account — Prangan",
  description: "How to request deletion of your Prangan account and data.",
};

export default function DeleteAccountPage() {
  return (
    <main className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline">
        ← Back
      </Link>
      <h1>Delete Your Account</h1>
      <p>
        You can request permanent deletion of your Prangan account and all associated data at any
        time.
      </p>

      <h2>How to Request Deletion</h2>
      <ol>
        <li>
          Email <a href="mailto:support@example.com">support@example.com</a> from the address
          associated with your account.
        </li>
        <li>
          Use the subject line <strong>&quot;Delete my account&quot;</strong>.
        </li>
        <li>We will verify your request and delete your account within 30 days.</li>
      </ol>

      <h2>What Gets Deleted</h2>
      <p>
        Your profile, account credentials, and personal data are permanently removed. Some records
        may be retained where required by law.
      </p>

      <p>
        Questions? See <Link href="/help">Help &amp; Support</Link> or review our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  );
}
