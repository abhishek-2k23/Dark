import type { Metadata } from "next";
import Link from "next/link";

import { POLICY_LAST_UPDATED, SUPPORT_EMAIL } from "~/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions — Prangan",
  description: "The terms governing your use of Prangan.",
};

export default function TermsPage() {
  return (
    <main className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline">
        ← Back
      </Link>
      <h1>Terms &amp; Conditions</h1>
      <p className="text-sm text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By downloading, accessing, or using Prangan (the &quot;Service&quot;) you agree to be bound by
        these Terms &amp; Conditions. If you do not agree, please do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Prangan is a residential-community management application that connects residents, security
        staff, and administrators of a housing society. What you can see and do depends on your role.
        You can join a society either by an administrator&apos;s invitation or by requesting access,
        which an administrator must approve before you see any of that society&apos;s data.
      </p>

      <h2>3. Your Account</h2>
      <p>
        You are responsible for keeping your login credentials secure and for all activity under your
        account. You must provide accurate information and keep it up to date. You may delete your
        account at any time from the{" "}
        <Link href="/delete-account">Delete Account</Link> page.
      </p>

      <h2>4. Acceptable Use</h2>
      <p>
        You agree not to misuse the Service, including by attempting to access data that is not yours,
        disrupting the Service, or using it for any unlawful purpose. Content you post (such as
        notices, complaints, or comments) must not be abusive, misleading, or infringing.
      </p>

      <h2>5. Records About Other People</h2>
      <p>
        The Service asks you to record details of visitors and guests — people who are usually not
        users of Prangan. If you enter someone else&apos;s name, phone number or photograph, you
        confirm you have a legitimate reason to do so and accept responsibility for that entry. Do not
        use visitor records to track, harass, or profile anyone.
      </p>

      <h2>6. Payments &amp; Subscriptions</h2>
      <p>
        Maintenance dues, amenity charges and service bills are amounts owed to your society or to an
        individual service provider — not to us. Payments are processed by Razorpay or settled offline
        and go directly to the recipient; we hold no funds and are not a party to those transactions.
        Whether a payment has cleared is ultimately your society&apos;s record, not ours.
      </p>
      <p>
        A society&apos;s own subscription to Prangan is billed separately and is not sold inside the
        mobile app. To start, change, or renew a plan, contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. If a subscription lapses,
        administrators lose the ability to make changes until it is renewed; residents and guards are
        unaffected and no data is deleted. Cancelling takes effect at the end of the period already
        paid for, and amounts already paid are not refunded.
      </p>

      <h2>7. Emergency Alerts</h2>
      <p>
        The emergency alert feature notifies other members of your society. It is not a substitute for
        the police, fire, ambulance, or any other emergency service, and it depends on phones,
        networks and notifications working. Do not rely on it as your only means of raising an alarm.
      </p>

      <h2>8. Data &amp; Privacy</h2>
      <p>
        Your use of the Service is also governed by our{" "}
        <Link href="/privacy">Privacy Policy</Link>, which explains what data we collect and how we
        use it.
      </p>

      <h2>9. Availability</h2>
      <p>
        We aim to keep the Service available but do not guarantee uninterrupted access. We may modify,
        suspend, or discontinue features at any time.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind. To the extent
        permitted by law, we are not liable for any indirect or consequential damages arising from
        your use of the Service.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes take
        effect constitutes acceptance of the revised Terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these Terms? See <Link href="/help">Help &amp; Support</Link> or email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </main>
  );
}
