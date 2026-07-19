import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Production-safe seeding of subscription plans.
 *
 * Deliberately separate from `seed.ts`, which WIPES every table and creates
 * demo accounts with a shared, publicly-known password. That file must never
 * run against production. This one:
 *
 *   - only ever upserts, never deletes;
 *   - touches exactly one table (Plan);
 *   - is idempotent, so re-running is a no-op when nothing changed;
 *   - prints the target database and a diff before writing.
 *
 * Existing subscriptions keep working across a price change: a Subscription
 * points at a Plan row by id, and upserting by `code` updates that row in
 * place rather than replacing it. A society mid-period is unaffected until its
 * next renewal, which then charges the new price.
 *
 * Usage:
 *   pnpm db:seed:plans -- --dry-run    # show what would change
 *   pnpm db:seed:plans                 # apply
 */

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

/**
 * ⚠️ PLACEHOLDER PRICING — replace with the real tiers before running against
 * production. Editing here and re-running is the supported way to change a
 * price; there is no migration and no deploy involved.
 */
const PLANS = [
  {
    code: "starter",
    name: "Starter",
    description: "For small societies finding their feet.",
    price: 999,
    intervalMonths: 1,
    maxFlats: 50,
    sortOrder: 1,
    isActive: true,
    features: [
      "Up to 50 flats",
      "Visitor management",
      "Notices & polls",
      "Maintenance dues",
      "Email support",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    description: "For established societies running day to day on Portl.",
    price: 2499,
    intervalMonths: 1,
    maxFlats: 200,
    sortOrder: 2,
    isActive: true,
    features: [
      "Up to 200 flats",
      "Everything in Starter",
      "Amenity bookings",
      "Helpdesk & complaints",
      "Staff directory",
      "Priority support",
    ],
  },
  {
    code: "growth-annual",
    name: "Growth (annual)",
    description: "Growth, billed yearly — two months free.",
    price: 24990,
    intervalMonths: 12,
    maxFlats: 200,
    sortOrder: 3,
    isActive: true,
    features: [
      "Everything in Growth",
      "Two months free vs monthly",
      "Locked-in pricing for a year",
    ],
  },
];

/** Host only — never print credentials, this output tends to end up in logs. */
function targetLabel(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log(`Target: ${targetLabel()}`);
  console.log(DRY_RUN ? "Mode:   DRY RUN (no writes)\n" : "Mode:   APPLY\n");

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const plan of PLANS) {
    const existing = await prisma.plan.findUnique({ where: { code: plan.code } });

    if (!existing) {
      console.log(`+ create  ${plan.code}  ₹${plan.price}/${plan.intervalMonths}mo`);
      if (!DRY_RUN) await prisma.plan.create({ data: plan });
      created++;
      continue;
    }

    const diffs: string[] = [];
    if (Number(existing.price) !== plan.price) {
      diffs.push(`price ₹${Number(existing.price)} → ₹${plan.price}`);
    }
    if (existing.name !== plan.name) diffs.push(`name "${existing.name}" → "${plan.name}"`);
    if (existing.intervalMonths !== plan.intervalMonths) {
      diffs.push(`interval ${existing.intervalMonths} → ${plan.intervalMonths}mo`);
    }
    if (existing.isActive !== plan.isActive) {
      diffs.push(`isActive ${existing.isActive} → ${plan.isActive}`);
    }
    if (JSON.stringify(existing.features) !== JSON.stringify(plan.features)) {
      diffs.push("features changed");
    }
    if (existing.maxFlats !== plan.maxFlats) {
      diffs.push(`maxFlats ${existing.maxFlats} → ${plan.maxFlats}`);
    }

    if (diffs.length === 0) {
      unchanged++;
      continue;
    }

    console.log(`~ update  ${plan.code}  ${diffs.join(", ")}`);
    if (!DRY_RUN) await prisma.plan.update({ where: { code: plan.code }, data: plan });
    updated++;
  }

  // Plans present in the database but absent here are reported, never deleted:
  // a society may be subscribed to one, and the FK would block the delete
  // anyway. Retiring a plan means setting isActive false, which hides it from
  // the picker while existing subscribers keep their terms.
  const known = new Set(PLANS.map((p) => p.code));
  const extras = await prisma.plan.findMany({ where: { code: { notIn: [...known] } } });
  for (const extra of extras) {
    console.log(
      `! extra   ${extra.code} exists in the database but not in this file (left untouched${
        extra.isActive ? "; still ACTIVE and purchasable" : "; already inactive"
      })`,
    );
  }

  console.log(
    `\n${DRY_RUN ? "Would apply" : "Applied"}: ${created} created, ${updated} updated, ${unchanged} unchanged.`,
  );
  if (DRY_RUN) console.log("Re-run without --dry-run to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
