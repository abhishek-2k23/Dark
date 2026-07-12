import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Support — Portal",
  description: "Frequently asked questions and support contact for Portal.",
};

export default function HelpPage() {
  return (
    <main className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline">
        ← Back
      </Link>
      <h1>Help &amp; Support</h1>

      <h2>Getting Started</h2>
      <p>
        Download Portal, create an account, and follow the in-app prompts to get up and running.
      </p>

      <h2>Frequently Asked Questions</h2>
      <h3>How do I reset my password?</h3>
      <p>Use the &quot;Forgot password&quot; option on the sign-in screen to receive a reset link.</p>

      <h3>How do I delete my account?</h3>
      <p>
        Visit the <Link href="/delete-account">Delete Account</Link> page and follow the
        instructions.
      </p>

      <h2>Contact Support</h2>
      <p>
        Still need help? Email us at{" "}
        <a href="mailto:support@example.com">support@example.com</a> and we&apos;ll get back to you.
      </p>
    </main>
  );
}
