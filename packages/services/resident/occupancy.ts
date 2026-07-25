import { prisma } from "@repo/database";

/**
 * Who owns a flat, and whether it can take another owner.
 *
 * A flat is **occupied** once it has a primary resident. That is the rule the
 * admin UI greys out on, the invite endpoint rejects on, and the bulk import
 * flags on, so it lives in one place rather than being re-expressed three times.
 *
 * Additional people in the same flat are still representable — a second
 * `ResidentProfile` with `isPrimaryResident: false` shares the flat's visitors
 * and dues — but nothing in the admin UI creates one today, by design: a flat
 * that already has an owner is not offered as a destination.
 */

/**
 * The minimum shape of a Prisma client this module needs, so the same helper
 * works against `prisma` and against a transaction client.
 */
type ProfileClient = {
  residentProfile: {
    count: (args: { where: { flatId: string; isPrimaryResident?: boolean } }) => Promise<number>;
  };
};

/**
 * Whether the resident being linked to this flat should be its primary.
 *
 * The first person into an empty flat owns it. This exists because the four
 * places that link a resident to a flat — invited signup, two Google sign-in
 * paths and join-request approval — all used to leave `isPrimaryResident` at
 * its `false` default, which meant no flat linked that way ever registered as
 * occupied and the whole rule quietly did nothing.
 */
export async function shouldBePrimaryResident(
  client: ProfileClient,
  flatId: string,
): Promise<boolean> {
  return (await client.residentProfile.count({ where: { flatId } })) === 0;
}

/** Whether the flat already has a primary resident. */
export async function isFlatOccupied(
  flatId: string,
  client: ProfileClient = prisma,
): Promise<boolean> {
  return (
    (await client.residentProfile.count({
      where: { flatId, isPrimaryResident: true },
    })) > 0
  );
}
