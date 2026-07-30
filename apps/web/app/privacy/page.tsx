import type { Metadata } from "next";
import Link from "next/link";

import { APP_NAME, POLICY_LAST_UPDATED, SUPPORT_EMAIL } from "~/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Prangan",
  description: "How Prangan collects, uses, and protects your data.",
};

/**
 * Must agree with the Play Data safety form and with what the code actually does
 * — written from the schema and the upload/notification/payment paths, not a
 * template. See docs/play-release-checklist.md for the mapping.
 */
export default function PrivacyPage() {
  return (
    <main className="prose prose-neutral dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground no-underline">
        ← Back
      </Link>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: {POLICY_LAST_UPDATED}</p>

      <h2>Overview</h2>
      <p>
        {APP_NAME} is a residential-community management app for housing societies. It is used by
        three kinds of people in a society — residents, security guards, and administrators — and
        this policy explains what it stores about each of them, why, who else can see it, and how to
        get rid of it.
      </p>
      <p>
        We do not sell your data, we do not use it for advertising, and we do not run any advertising
        or analytics SDKs in the app.
      </p>

      <h2>Information You Give Us</h2>
      <ul>
        <li>
          <strong>Account and profile:</strong> your name, email address, phone number, and password
          (stored only as an Argon2 hash — we never keep the password itself). If you sign in with
          Google we receive your Google account identifier, name, email, and profile picture URL.
        </li>
        <li>
          <strong>Your place in the society:</strong> your role, your society, your tower and flat,
          and for committee members your designation.
        </li>
        <li>
          <strong>Emergency contact:</strong> a name and phone number you choose to add, so someone
          can be reached on your behalf.
        </li>
        <li>
          <strong>Household details you choose to add:</strong> family members (name, relationship,
          phone, photo) and vehicles (type and registration number).
        </li>
        <li>
          <strong>Photos and documents:</strong> a profile picture, photos attached to complaints,
          photos of visitors taken at the gate, payment receipts you upload, and — for
          administrators — society logos, notice images, amenity photos, and resident-import
          spreadsheets.
        </li>
        <li>
          <strong>What you post:</strong> complaints and their comments, notices, poll votes, amenity
          bookings, and messages to your society.
        </li>
      </ul>

      <h2>Information About Visitors and Guests</h2>
      <p>
        Residents and guards record people who come to the society: a visitor&apos;s name, phone
        number, purpose of visit, entry and exit times, the flat they are visiting, and sometimes a
        photograph taken at the gate. Guest passes additionally store an email address so the pass
        can be sent.
      </p>
      <p>
        These people are usually not {APP_NAME} users and have not agreed to this policy. If you
        enter someone else&apos;s details, you are responsible for having a legitimate reason to do
        so and for telling them if they ask. Your society administrator can delete any visitor
        record, and anyone recorded as a visitor can write to us at{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> to have their record removed.
      </p>

      <h2>Information Collected Automatically</h2>
      <ul>
        <li>
          <strong>Push notification token:</strong> an identifier for your device&apos;s copy of the
          app, so we can notify you about visitors, complaints, notices, dues and emergencies. Used
          for nothing else.
        </li>
        <li>
          <strong>Session and security records:</strong> login sessions and refresh tokens (stored
          hashed), and one-time codes for email verification and account deletion. These expire.
        </li>
        <li>
          <strong>App integrity signals:</strong> the app asks Google Play Integrity to confirm it is
          a genuine, unmodified install before it talks to our servers. This checks the app and the
          device, not you, and returns no personal information to us.
        </li>
        <li>
          <strong>Server logs:</strong> ordinary request logs kept briefly for security and
          debugging.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect your location, contacts, calendar, microphone audio, SMS,
        call logs, installed-app list, or advertising identifier.
      </p>

      <h2>Device Permissions</h2>
      <ul>
        <li>
          <strong>Camera</strong> — to photograph a complaint, a payment receipt, a visitor at the
          gate, or to scan a gate pass. Stills only; the app never records audio or video.
        </li>
        <li>
          <strong>Photos</strong> — to attach an image you have already taken.
        </li>
        <li>
          <strong>Notifications</strong> — to alert you as described above.
        </li>
        <li>
          <strong>Biometrics / device passcode</strong> — optional app lock. The check happens
          entirely on your device; no fingerprint or face data is ever sent to us or stored by us.
        </li>
        <li>
          <strong>Files</strong> — only to save a report you asked to download, to a folder you pick.
        </li>
      </ul>

      <h2>Who Can See Your Information</h2>
      <p>
        {APP_NAME} is shared software: your society&apos;s administrators can see the residents,
        flats, complaints, dues and payments of that society, and guards can see visitor records for
        the society they work at. Residents see their own flat&apos;s records — note that people who
        share a flat share its visitor log and its dues. Nobody in one society can see another
        society&apos;s data.
      </p>

      <h2>Service Providers</h2>
      <p>We share data with these companies only so far as they need it to do their job for us:</p>
      <ul>
        <li>
          <strong>Cloudinary</strong> — stores and serves the images described above.
        </li>
        <li>
          <strong>Razorpay</strong> — processes payments. Card, UPI and bank details are entered with
          Razorpay and never reach our servers; we store only the payment&apos;s amount, method,
          status and Razorpay reference. Money for maintenance dues is settled directly to your
          society&apos;s account, not to us.
        </li>
        <li>
          <strong>Google (Firebase Cloud Messaging, Play Integrity) and Expo</strong> — deliver push
          notifications and verify app integrity.
        </li>
        <li>
          <strong>Email delivery</strong> — sends verification codes, password resets, guest passes
          and complaint receipts.
        </li>
        <li>
          <strong>Hosting and database providers</strong> — run the service.
        </li>
      </ul>
      <p>We do not sell or rent personal data to anyone, for any purpose.</p>

      <h2>Data Retention &amp; Deletion</h2>
      <p>
        We keep your data for as long as your account exists. You can delete your account at any
        time, from the app (Profile → Delete account) or from the{" "}
        <Link href="/delete-account">Delete Account</Link> page here — we email a one-time code to
        confirm it is really you, then remove your profile, credentials, sessions, push tokens and
        personal records.
      </p>
      <p>
        Two things survive a deletion, and you should know which: records that belong to the society
        rather than to you (for example a paid maintenance receipt, or a complaint another resident is
        still party to) may be retained where accounting or legal obligations require it, and backups
        age out on their own schedule. Nothing retained is used to contact you or to rebuild your
        account.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed with Argon2 and never stored in plain text. Traffic is encrypted in
        transit. Sessions use short-lived access tokens with rotating refresh tokens, and a reused
        refresh token invalidates the session. Requests from the mobile app are attested with Google
        Play Integrity. No system is perfectly secure, but these are the measures we take.
      </p>

      <h2>Children</h2>
      <p>
        {APP_NAME} is intended for adult members of a housing society and is not directed at children
        under 13. We do not knowingly collect data from them. A parent may add a family member who is
        a child; that entry holds only what the parent chose to enter, and can be removed at any time.
      </p>

      <h2>Your Rights</h2>
      <p>
        You can view and correct your profile in the app, and delete your account as described above.
        To ask what we hold about you, to correct something you cannot reach yourself, or to complain
        about how we have handled your data, write to us at the address below. We respond to
        grievances within 30 days.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        If this policy changes materially we will update the date above and, where the change affects
        how we use existing data, tell you in the app.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, data requests, or grievances, contact{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </main>
  );
}
