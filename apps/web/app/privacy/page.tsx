import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Prangan",
  description: "How Prangan collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <main className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline">
        ← Back
      </Link>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <h2>Overview</h2>
      <p>
        This Privacy Policy explains how Prangan (&quot;we&quot;, &quot;us&quot;) collects, uses, and
        safeguards your information when you use our application and services.
      </p>

      <h2>Information We Collect</h2>
      <p>
        We collect the information you provide when creating an account, such as your name and email
        address, along with basic usage data needed to operate the service.
      </p>

      <h2>How We Use Information</h2>
      <p>
        We use your information to provide and improve the service, secure your account, and
        communicate with you about the service.
      </p>

      <h2>Data Retention &amp; Deletion</h2>
      <p>
        You may request deletion of your account and associated data at any time. See the{" "}
        <Link href="/delete-account">Delete Account</Link> page for instructions.
      </p>

      <h2>Contact</h2>
      <p>
        For any privacy questions, contact us at{" "}
        <a href="mailto:support@example.com">support@example.com</a>.
      </p>
    </main>
  );
}
