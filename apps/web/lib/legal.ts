/**
 * One place for the details the legal pages share.
 *
 * These are not decoration. Google Play checks that an app's privacy policy is
 * reachable, names the developer, gives a working contact, and describes the
 * data the app actually handles; a policy with a placeholder address is a
 * standard rejection under the User Data policy. India's DPDP Act adds the
 * grievance-contact requirement.
 *
 * Change `SUPPORT_EMAIL` here and every page follows.
 */

/**
 * Must be a mailbox that is actually read — a Play reviewer may write to it, and
 * so may users exercising a data-deletion request.
 */
export const SUPPORT_EMAIL = "kumar.abhishek2k23@gmail.com";

/** The name the app is published under, as it appears on the Play listing. */
export const APP_NAME = "Prangan";

/**
 * Shown as "last updated" on the policy pages. A hardcoded date, deliberately:
 * this was `new Date().getFullYear()`, which claimed the policy was revised
 * whenever the page happened to be rendered. Bump it when the text changes.
 */
export const POLICY_LAST_UPDATED = "30 July 2026";
