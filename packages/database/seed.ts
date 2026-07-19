import "dotenv/config";
import argon2 from "argon2";
import {
  PrismaClient,
  type FlatType,
  type VehicleType,
  type ServiceCategory,
  type NoticeCategory,
} from "@prisma/client";

const prisma = new PrismaClient();

// Dev-only password shared by every seeded LOCAL account.
const PASSWORD = "password123";

// ---------------------------------------------------------------------------
// SEED DATA — "Prangan Communities"
//
// Prangan hosts many independent societies (a multi-tenant registry we call
// "Prangan Communities"). Each society below is fully self-contained: its own
// towers, flats, admin, guard, residents, notices, poll, amenities, service
// directory and current-month maintenance dues. Data is scoped by societyId
// everywhere, so the societies never see each other's data.
//
// Every LOCAL login uses the password `password123`.
// ---------------------------------------------------------------------------

type ResidentSpec = {
  name: string;
  email?: string;
  phone?: string;
  provider?: "LOCAL" | "GOOGLE";
  emailVerified?: boolean;
  googleId?: string;
  avatarUrl?: string;
  flat: string; // "<tower>-<flatNumber>", e.g. "A-101"
  isPrimary?: boolean;
  moveInDate?: string;
  family?: { name: string; relation: string; age?: number }[];
  vehicles?: { number: string; type: VehicleType }[];
};

type SocietySpec = {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  towers: string[];
  flats: { tower: string; flatNumber: string; floor: number; type: FlatType }[];
  admin: { name: string; email: string; phone: string; designation: string };
  guard: {
    name: string;
    email: string;
    phone: string;
    gate: string;
    shiftStart: string;
    shiftEnd: string;
  };
  residents: ResidentSpec[];
  notices: { title: string; body: string; category: NoticeCategory; pinned?: boolean }[];
  poll: { question: string; options: string[] };
  amenities: {
    name: string;
    description: string;
    rules?: string;
    pricePerSlot?: string;
  }[];
  serviceProviders: {
    name: string;
    category: ServiceCategory;
    phone: string;
    verified?: boolean;
  }[];
  // Current-month maintenance charge applied to every flat (Decimal string).
  monthlyDue: string;
};

const societies: SocietySpec[] = [
  // -------------------------------------------------------------------------
  // 1. GREEN MEADOWS — the canonical dev society. These exact accounts are
  //    referenced in docs and used for live testing; keep them stable.
  //    Every seeded account is email-verified, so password login never triggers
  //    an OTP (email or phone both work directly).
  // -------------------------------------------------------------------------
  {
    name: "Green Meadows",
    address: "12 Lakeside Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560103",
    towers: ["A", "B"],
    flats: [
      { tower: "A", flatNumber: "101", floor: 1, type: "TWO_BHK" },
      { tower: "A", flatNumber: "102", floor: 1, type: "THREE_BHK" },
      { tower: "A", flatNumber: "201", floor: 2, type: "TWO_BHK" },
      { tower: "B", flatNumber: "101", floor: 1, type: "ONE_BHK" },
      { tower: "B", flatNumber: "102", floor: 1, type: "TWO_BHK" },
      { tower: "B", flatNumber: "201", floor: 2, type: "THREE_BHK" },
    ],
    admin: {
      name: "Anita Sharma",
      email: "admin@greenmeadows.test",
      phone: "+919800000001",
      designation: "Society Secretary",
    },
    guard: {
      name: "Ram Singh",
      email: "guard@greenmeadows.test",
      phone: "+919800000002",
      gate: "Gate 1",
      shiftStart: "08:00",
      shiftEnd: "20:00",
    },
    residents: [
      {
        name: "Ravi Kumar",
        email: "ravi@example.test",
        phone: "+919800000003",
        emailVerified: true, // all dummy accounts are verified — no OTP on login
        flat: "A-101",
        isPrimary: true,
        moveInDate: "2024-06-01",
        family: [{ name: "Meera Kumar", relation: "Spouse", age: 34 }],
        vehicles: [{ number: "KA01AB1234", type: "CAR" }],
      },
      {
        name: "Priya Nair",
        email: "priya@example.test",
        provider: "GOOGLE",
        googleId: "google-seed-priya-001",
        avatarUrl: "https://example.test/avatars/priya.png",
        flat: "B-101",
        isPrimary: true,
        moveInDate: "2025-01-15",
      },
    ],
    notices: [
      {
        title: "Water supply maintenance",
        body: "Water supply will be interrupted on Saturday 10:00-14:00 for tank cleaning.",
        category: "MAINTENANCE",
        pinned: true,
      },
      {
        title: "Diwali celebration",
        body: "Join us at the clubhouse lawn for the society Diwali event. Snacks and games for kids.",
        category: "EVENT",
      },
    ],
    poll: {
      question: "Should we install EV charging points in the basement parking?",
      options: ["Yes", "No", "Need more details"],
    },
    amenities: [
      {
        name: "Clubhouse Hall",
        description: "Air-conditioned hall for private events, capacity 80.",
        rules: "Booking required at least 2 days in advance. No loud music after 10 PM.",
        pricePerSlot: "1500.00",
      },
      {
        name: "Tennis Court",
        description: "Synthetic surface court, floodlit.",
        rules: "Max 1 hour per booking during peak hours (6-9 AM, 5-8 PM).",
        pricePerSlot: "200.00",
      },
      {
        name: "Swimming Pool",
        description: "25m pool with separate kids section.",
        rules: "Swim cap mandatory. Children under 12 must be accompanied by an adult.",
      },
    ],
    serviceProviders: [
      { name: "Lakshmi (Housekeeping)", category: "MAID", phone: "+919810000011", verified: true },
      { name: "Suresh Electricals", category: "ELECTRICIAN", phone: "+919810000012", verified: true },
      { name: "QuickFix Plumbing", category: "PLUMBER", phone: "+919810000013" },
    ],
    monthlyDue: "2500.00",
  },

  // -------------------------------------------------------------------------
  // 2. PALM GROVE RESIDENCY — Pune.
  // -------------------------------------------------------------------------
  {
    name: "Palm Grove Residency",
    address: "45 Orchard Avenue, Baner",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411045",
    towers: ["Palm", "Grove"],
    flats: [
      { tower: "Palm", flatNumber: "101", floor: 1, type: "TWO_BHK" },
      { tower: "Palm", flatNumber: "202", floor: 2, type: "THREE_BHK" },
      { tower: "Palm", flatNumber: "303", floor: 3, type: "THREE_BHK" },
      { tower: "Grove", flatNumber: "101", floor: 1, type: "ONE_BHK" },
      { tower: "Grove", flatNumber: "102", floor: 1, type: "TWO_BHK" },
    ],
    admin: {
      name: "Rajesh Patil",
      email: "admin@palmgrove.test",
      phone: "+919820000001",
      designation: "Managing Committee Chairman",
    },
    guard: {
      name: "Vijay More",
      email: "guard@palmgrove.test",
      phone: "+919820000002",
      gate: "Main Gate",
      shiftStart: "07:00",
      shiftEnd: "19:00",
    },
    residents: [
      {
        name: "Sneha Deshpande",
        email: "sneha@palmgrove.test",
        phone: "+919820000003",
        emailVerified: true,
        flat: "Palm-101",
        isPrimary: true,
        moveInDate: "2023-03-10",
        family: [
          { name: "Aarav Deshpande", relation: "Son", age: 8 },
          { name: "Kiran Deshpande", relation: "Spouse", age: 38 },
        ],
        vehicles: [
          { number: "MH12CD5678", type: "CAR" },
          { number: "MH12EF9012", type: "BIKE" },
        ],
      },
      {
        name: "Arjun Mehta",
        email: "arjun@palmgrove.test",
        phone: "+919820000004",
        emailVerified: true,
        flat: "Grove-102",
        isPrimary: true,
        moveInDate: "2024-11-20",
        vehicles: [{ number: "MH12GH3456", type: "CAR" }],
      },
    ],
    notices: [
      {
        title: "Monsoon drainage check",
        body: "Facility team will inspect balcony and terrace drains this week ahead of the monsoon.",
        category: "MAINTENANCE",
        pinned: true,
      },
      {
        title: "AGM scheduled",
        body: "The Annual General Meeting is on the last Sunday of this month at the community hall, 11 AM.",
        category: "GENERAL",
      },
    ],
    poll: {
      question: "Which weekend should we hold the society sports day?",
      options: ["First Saturday", "Second Saturday", "Third Sunday"],
    },
    amenities: [
      {
        name: "Community Hall",
        description: "Multipurpose hall for functions, capacity 120.",
        rules: "No cooking inside the hall. Decorations must be removed the same day.",
        pricePerSlot: "2000.00",
      },
      {
        name: "Gymnasium",
        description: "Fully equipped gym with cardio and weights.",
        rules: "Members only. Wipe down equipment after use.",
      },
      {
        name: "Kids Play Area",
        description: "Outdoor play zone with soft flooring.",
        rules: "Children must be supervised by an adult at all times.",
      },
    ],
    serviceProviders: [
      { name: "Sunita Maid Services", category: "MAID", phone: "+919830000011", verified: true },
      { name: "Deccan Drivers", category: "DRIVER", phone: "+919830000012" },
      { name: "PowerLine Electricians", category: "ELECTRICIAN", phone: "+919830000013", verified: true },
    ],
    monthlyDue: "3200.00",
  },

  // -------------------------------------------------------------------------
  // 3. LAKEVIEW ENCLAVE — Gurugram.
  // -------------------------------------------------------------------------
  {
    name: "Lakeview Enclave",
    address: "Sector 54, Golf Course Road",
    city: "Gurugram",
    state: "Haryana",
    pincode: "122002",
    towers: ["North", "South"],
    flats: [
      { tower: "North", flatNumber: "1201", floor: 12, type: "THREE_BHK" },
      { tower: "North", flatNumber: "1202", floor: 12, type: "FOUR_BHK" },
      { tower: "South", flatNumber: "0801", floor: 8, type: "TWO_BHK" },
      { tower: "South", flatNumber: "0802", floor: 8, type: "THREE_BHK" },
    ],
    admin: {
      name: "Neha Kapoor",
      email: "admin@lakeview.test",
      phone: "+919840000001",
      designation: "RWA President",
    },
    guard: {
      name: "Balbir Yadav",
      email: "guard@lakeview.test",
      phone: "+919840000002",
      gate: "Tower Lobby",
      shiftStart: "20:00",
      shiftEnd: "08:00",
    },
    residents: [
      {
        name: "Karan Malhotra",
        email: "karan@lakeview.test",
        phone: "+919840000003",
        emailVerified: true,
        flat: "North-1201",
        isPrimary: true,
        moveInDate: "2022-09-05",
        family: [{ name: "Simran Malhotra", relation: "Spouse", age: 41 }],
        vehicles: [{ number: "HR26JK7890", type: "CAR" }],
      },
      {
        name: "Divya Reddy",
        email: "divya@lakeview.test",
        provider: "GOOGLE",
        googleId: "google-seed-divya-001",
        avatarUrl: "https://example.test/avatars/divya.png",
        flat: "South-0801",
        isPrimary: true,
        moveInDate: "2025-04-01",
      },
    ],
    notices: [
      {
        title: "Fire drill this Friday",
        body: "A mandatory fire evacuation drill will be conducted at 6 PM. Please participate.",
        category: "EMERGENCY",
        pinned: true,
      },
      {
        title: "Clubhouse renovation update",
        body: "The clubhouse will reopen next month with a new lounge and co-working space.",
        category: "GENERAL",
      },
    ],
    poll: {
      question: "Should we switch the common-area lighting to solar?",
      options: ["Yes, go solar", "No, keep current", "Pilot on one tower first"],
    },
    amenities: [
      {
        name: "Infinity Pool",
        description: "Rooftop temperature-controlled pool with lake view.",
        rules: "Open 6 AM - 9 PM. Shower before entering.",
        pricePerSlot: "500.00",
      },
      {
        name: "Banquet Lawn",
        description: "Landscaped lawn for large gatherings, capacity 200.",
        rules: "Sound permits required for events after 9 PM.",
        pricePerSlot: "5000.00",
      },
    ],
    serviceProviders: [
      { name: "Elite Home Care", category: "MAID", phone: "+919850000011", verified: true },
      { name: "Gurgaon PlumbPro", category: "PLUMBER", phone: "+919850000012", verified: true },
      { name: "City Cab Drivers", category: "DRIVER", phone: "+919850000013" },
    ],
    monthlyDue: "6500.00",
  },
];

async function seedSociety(spec: SocietySpec, passwordHash: string) {
  const society = await prisma.society.create({
    data: {
      name: spec.name,
      address: spec.address,
      city: spec.city,
      state: spec.state,
      pincode: spec.pincode,
    },
  });

  // Towers, keyed by name for flat lookup.
  const towerByName = new Map<string, string>();
  for (const name of spec.towers) {
    const tower = await prisma.tower.create({
      data: { societyId: society.id, name },
    });
    towerByName.set(name, tower.id);
  }

  // Flats, keyed by "<tower>-<flatNumber>".
  const flatByKey = new Map<string, string>();
  for (const f of spec.flats) {
    const towerId = towerByName.get(f.tower)!;
    const flat = await prisma.flat.create({
      data: {
        towerId,
        flatNumber: f.flatNumber,
        floor: f.floor,
        type: f.type,
      },
    });
    flatByKey.set(`${f.tower}-${f.flatNumber}`, flat.id);
  }

  // Admin (+ profile).
  const admin = await prisma.user.create({
    data: {
      name: spec.admin.name,
      email: spec.admin.email,
      phone: spec.admin.phone,
      passwordHash,
      emailVerified: true,
      role: "ADMIN",
      societyId: society.id,
      adminProfile: {
        create: { societyId: society.id, designation: spec.admin.designation },
      },
    },
  });

  // Guard (+ profile).
  await prisma.user.create({
    data: {
      name: spec.guard.name,
      email: spec.guard.email,
      phone: spec.guard.phone,
      passwordHash,
      emailVerified: true,
      role: "GUARD",
      societyId: society.id,
      guardProfile: {
        create: {
          societyId: society.id,
          gateAssigned: spec.guard.gate,
          shiftStart: spec.guard.shiftStart,
          shiftEnd: spec.guard.shiftEnd,
        },
      },
    },
  });

  // Residents (+ profile, family, vehicles).
  for (const r of spec.residents) {
    const flatId = flatByKey.get(r.flat)!;
    const isGoogle = r.provider === "GOOGLE";
    await prisma.user.create({
      data: {
        name: r.name,
        email: r.email,
        phone: r.phone,
        passwordHash: isGoogle ? null : passwordHash,
        authProvider: isGoogle ? "GOOGLE" : "LOCAL",
        googleId: r.googleId,
        avatarUrl: r.avatarUrl,
        emailVerified: isGoogle ? true : (r.emailVerified ?? true),
        role: "RESIDENT",
        societyId: society.id,
        residentProfile: {
          create: {
            flatId,
            isPrimaryResident: r.isPrimary ?? true,
            moveInDate: r.moveInDate ? new Date(r.moveInDate) : null,
            familyMembers: r.family ? { create: r.family } : undefined,
            vehicles: r.vehicles ? { create: r.vehicles } : undefined,
          },
        },
      },
    });
  }

  // Notices (published by the admin).
  await prisma.notice.createMany({
    data: spec.notices.map((n) => ({
      societyId: society.id,
      title: n.title,
      body: n.body,
      category: n.category,
      isPinned: n.pinned ?? false,
      publishedByAdminId: admin.id,
    })),
  });

  // One active poll (7-day deadline).
  await prisma.poll.create({
    data: {
      societyId: society.id,
      question: spec.poll.question,
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByAdminId: admin.id,
      options: { create: spec.poll.options.map((text) => ({ text })) },
    },
  });

  // Amenities.
  await prisma.amenity.createMany({
    data: spec.amenities.map((a) => ({
      societyId: society.id,
      name: a.name,
      description: a.description,
      rules: a.rules,
      pricePerSlot: a.pricePerSlot,
    })),
  });

  // Service directory (added by the admin).
  await prisma.serviceProvider.createMany({
    data: spec.serviceProviders.map((s) => ({
      societyId: society.id,
      name: s.name,
      category: s.category,
      phone: s.phone,
      isVerified: s.verified ?? false,
      addedByAdminId: admin.id,
    })),
  });

  // Current-month maintenance dues for every flat (PENDING, due on the 10th).
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const dueDate = new Date(Date.UTC(year, now.getUTCMonth(), 10));
  await prisma.maintenanceDue.createMany({
    data: [...flatByKey.values()].map((flatId) => ({
      flatId,
      month,
      year,
      amount: spec.monthlyDue,
      dueDate,
      status: "PENDING" as const,
    })),
  });

  return {
    society: spec.name,
    towers: spec.towers.length,
    flats: spec.flats.length,
    residents: spec.residents.length,
  };
}

async function main() {
  // Wipe existing data (dev-only seed) in FK dependency order.
  await prisma.notification.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.maintenanceDue.deleteMany();
  await prisma.amenityBooking.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.pollVote.deleteMany();
  await prisma.pollOption.deleteMany();
  await prisma.poll.deleteMany();
  await prisma.notice.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.helpdeskTicket.deleteMany();
  await prisma.guestPreApproval.deleteMany();
  await prisma.visitor.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.pendingResidentInvite.deleteMany();
  await prisma.emailOtp.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.familyMember.deleteMany();
  await prisma.residentProfile.deleteMany();
  await prisma.guardProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.flat.deleteMany();
  await prisma.tower.deleteMany();
  await prisma.society.deleteMany();

  const passwordHash = await argon2.hash(PASSWORD);

  await seedPlans();

  const results = [];
  for (const spec of societies) {
    results.push(await seedSociety(spec, passwordHash));
  }

  console.log(`Seed complete — ${results.length} societies ("Prangan Communities"):`);
  for (const r of results) {
    console.log(
      `  • ${r.society}: ${r.towers} towers, ${r.flats} flats, ${r.residents} residents (+1 admin, +1 guard)`,
    );
  }
  console.log(`\nAll LOCAL logins use password "${PASSWORD}".`);
  console.log("Dev admins: admin@greenmeadows.test · admin@palmgrove.test · admin@lakeview.test");
  console.log("All accounts are email-verified — password login never triggers an OTP.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Subscription plans.
 *
 * ⚠️ PLACEHOLDER PRICING — these numbers are illustrative, not agreed. They
 * live in the database precisely so correcting them is a seed edit and a
 * re-run, never a migration or a deploy.
 *
 * Upserted by `code` so re-seeding an existing database updates prices in
 * place rather than creating duplicates that societies might be pointing at.
 */
async function seedPlans() {
  const plans = [
    {
      code: "starter",
      name: "Starter",
      description: "For small societies finding their feet.",
      price: 999,
      intervalMonths: 1,
      maxFlats: 50,
      sortOrder: 1,
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
      features: [
        "Everything in Growth",
        "Two months free vs monthly",
        "Locked-in pricing for a year",
      ],
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }
  console.log(`Seeded ${plans.length} subscription plans (PLACEHOLDER pricing).`);
}
