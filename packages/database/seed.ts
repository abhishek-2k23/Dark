import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  const society = await prisma.society.create({
    data: {
      name: "Green Meadows",
      address: "12 Lakeside Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560103",
    },
  });

  const towerA = await prisma.tower.create({
    data: { societyId: society.id, name: "A" },
  });
  const towerB = await prisma.tower.create({
    data: { societyId: society.id, name: "B" },
  });

  const flats = await Promise.all(
    [
      { towerId: towerA.id, flatNumber: "101", floor: 1, type: "TWO_BHK" },
      { towerId: towerA.id, flatNumber: "102", floor: 1, type: "THREE_BHK" },
      { towerId: towerA.id, flatNumber: "201", floor: 2, type: "TWO_BHK" },
      { towerId: towerB.id, flatNumber: "101", floor: 1, type: "ONE_BHK" },
      { towerId: towerB.id, flatNumber: "102", floor: 1, type: "TWO_BHK" },
      { towerId: towerB.id, flatNumber: "201", floor: 2, type: "THREE_BHK" },
    ].map((f) => prisma.flat.create({ data: f as never })),
  );

  // Dev-only password for all seeded LOCAL accounts.
  const passwordHash = await argon2.hash("password123");

  const admin = await prisma.user.create({
    data: {
      name: "Anita Sharma",
      email: "admin@greenmeadows.test",
      phone: "+919800000001",
      passwordHash,
      emailVerified: true,
      role: "ADMIN",
      societyId: society.id,
      adminProfile: {
        create: { societyId: society.id, designation: "Society Secretary" },
      },
    },
  });

  await prisma.user.create({
    data: {
      name: "Ram Singh",
      email: "guard@greenmeadows.test",
      phone: "+919800000002",
      passwordHash,
      emailVerified: true,
      role: "GUARD",
      societyId: society.id,
      guardProfile: {
        create: {
          societyId: society.id,
          gateAssigned: "Gate 1",
          shiftStart: "08:00",
          shiftEnd: "20:00",
        },
      },
    },
  });

  // Resident 1 — LOCAL auth. Deliberately left email-UNVERIFIED so the
  // email-login OTP flow is testable; logging in via phone works directly.
  await prisma.user.create({
    data: {
      name: "Ravi Kumar",
      email: "ravi@example.test",
      phone: "+919800000003",
      passwordHash,
      emailVerified: false,
      role: "RESIDENT",
      societyId: society.id,
      residentProfile: {
        create: {
          flatId: flats[0]!.id,
          isPrimaryResident: true,
          moveInDate: new Date("2024-06-01"),
          familyMembers: {
            create: [{ name: "Meera Kumar", relation: "Spouse", age: 34 }],
          },
          vehicles: {
            create: [{ number: "KA01AB1234", type: "CAR" }],
          },
        },
      },
    },
  });

  // Resident 2 — GOOGLE auth (no password).
  await prisma.user.create({
    data: {
      name: "Priya Nair",
      email: "priya@example.test",
      authProvider: "GOOGLE",
      emailVerified: true,
      googleId: "google-seed-priya-001",
      avatarUrl: "https://example.test/avatars/priya.png",
      role: "RESIDENT",
      societyId: society.id,
      residentProfile: {
        create: {
          flatId: flats[3]!.id,
          isPrimaryResident: true,
          moveInDate: new Date("2025-01-15"),
        },
      },
    },
  });

  await prisma.notice.createMany({
    data: [
      {
        societyId: society.id,
        title: "Water supply maintenance",
        body: "Water supply will be interrupted on Saturday 10:00-14:00 for tank cleaning.",
        category: "MAINTENANCE",
        isPinned: true,
        publishedByAdminId: admin.id,
      },
      {
        societyId: society.id,
        title: "Diwali celebration",
        body: "Join us at the clubhouse lawn for the society Diwali event. Snacks and games for kids.",
        category: "EVENT",
        publishedByAdminId: admin.id,
      },
    ],
  });

  await prisma.poll.create({
    data: {
      societyId: society.id,
      question: "Should we install EV charging points in the basement parking?",
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdByAdminId: admin.id,
      options: {
        create: [{ text: "Yes" }, { text: "No" }, { text: "Need more details" }],
      },
    },
  });

  await prisma.amenity.createMany({
    data: [
      {
        societyId: society.id,
        name: "Clubhouse Hall",
        description: "Air-conditioned hall for private events, capacity 80.",
        rules: "Booking required at least 2 days in advance. No loud music after 10 PM.",
        pricePerSlot: "1500.00",
      },
      {
        societyId: society.id,
        name: "Tennis Court",
        description: "Synthetic surface court, floodlit.",
        rules: "Max 1 hour per booking during peak hours (6-9 AM, 5-8 PM).",
        pricePerSlot: "200.00",
      },
      {
        societyId: society.id,
        name: "Swimming Pool",
        description: "25m pool with separate kids section.",
        rules: "Swim cap mandatory. Children under 12 must be accompanied by an adult.",
      },
    ],
  });

  console.log("Seed complete: 1 society, 2 towers, 6 flats, 4 users (admin, guard, 2 residents), 2 notices, 1 poll, 3 amenities.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
