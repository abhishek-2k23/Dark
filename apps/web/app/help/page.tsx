import type { Metadata } from "next";
import Link from "next/link";

import { APP_NAME, SUPPORT_EMAIL } from "~/lib/legal";

export const metadata: Metadata = {
  title: "Help & Support — Prangan",
  description: "Frequently asked questions and support contact for Prangan.",
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
        Install {APP_NAME} and create an account with your email or phone number. If your society
        administrator has already invited you, signing up puts you straight into your flat. If not,
        the app asks for your administrator&apos;s email address and sends them a request to join —
        you get access once they approve it and assign your flat.
      </p>
      <p>
        Setting up a new society? Choose <em>Create society</em> on the sign-in screen. You become its
        first administrator and can then add towers, flats, residents and guards.
      </p>

      <h2>Frequently Asked Questions</h2>

      <h3>How do I reset my password?</h3>
      <p>
        Use &quot;Forgot password&quot; on the sign-in screen. We email you a link to set a new one.
      </p>

      <h3>I asked to join a society and nothing happened.</h3>
      <p>
        A join request goes to the administrator whose email you entered and waits for them to act on
        it. It expires after a couple of hours, after which you can send another. If the email address
        was wrong, nothing was sent — check it with your society office and try again.
      </p>

      <h3>How do I change or renew my society&apos;s subscription?</h3>
      <p>
        Subscriptions are not sold inside the app. Write to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will set up, switch or renew
        your society&apos;s plan. The Billing screen in the app shows your current plan and payment
        history at any time.
      </p>

      <h3>Why can other people in my flat see my visitors and dues?</h3>
      <p>
        Visitor records and maintenance dues belong to the flat rather than to one person, so everyone
        living in that flat shares them. Complaints, bookings and your profile are yours alone.
      </p>

      <h3>I&apos;m not getting notifications.</h3>
      <p>
        Check that notifications are allowed for {APP_NAME} in your device settings. While the app is
        open, most alerts appear as a banner inside the app instead of a system notification —
        emergencies always ring through.
      </p>

      <h3>How do I delete my account?</h3>
      <p>
        In the app, go to Profile → Delete account, or use the{" "}
        <Link href="/delete-account">Delete Account</Link> page here. We email a one-time code to
        confirm, then delete your data. See the <Link href="/privacy">Privacy Policy</Link> for what
        is removed and what may be retained.
      </p>

      <h2>Contact Support</h2>
      <p>
        Still need help? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we&apos;ll
        get back to you.
      </p>
    </main>
  );
}
