import type { Metadata } from "next";
import Link from "next/link";

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
      <p className="text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By downloading, accessing, or using Prangan (the &quot;Service&quot;) you agree to be bound by
        these Terms &amp; Conditions. If you do not agree, please do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Prangan is a residential-community management application that connects residents, security
        staff, and administrators of a housing society. Access to certain features depends on your
        role and on an invitation from your society administrator.
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

      <h2>5. Data &amp; Privacy</h2>
      <p>
        Your use of the Service is also governed by our{" "}
        <Link href="/privacy">Privacy Policy</Link>, which explains what data we collect and how we
        use it.
      </p>

      <h2>6. Availability</h2>
      <p>
        We aim to keep the Service available but do not guarantee uninterrupted access. We may modify,
        suspend, or discontinue features at any time.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of any kind. To the extent
        permitted by law, we are not liable for any indirect or consequential damages arising from
        your use of the Service.
      </p>

      <h2>8. Changes to These Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes take
        effect constitutes acceptance of the revised Terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these Terms? See <Link href="/help">Help &amp; Support</Link>.
      </p>
    </main>
  );
}
