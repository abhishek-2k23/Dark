import { societyService } from "@repo/services";

import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, subscribedAdminProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const societyPath = generatePath("v1/society");
const towerPath = generatePath("v1/towers");
const flatPath = generatePath("v1/flats");

// ---------------------------------------------------------------------------
// Shared models
// ---------------------------------------------------------------------------

export const FlatTypeEnum = z
  .enum(["ONE_RK", "ONE_BHK", "TWO_BHK", "THREE_BHK", "FOUR_BHK", "OTHER"])
  .describe("Flat configuration");

const SocietyModel = z
  .object({
    id: z.string().describe("Society id"),
    name: z.string().describe("Society name"),
    logoUrl: z.string().nullable().describe("Society logo URL, if set"),
    address: z.string().describe("Street address"),
    city: z.string().describe("City"),
    state: z.string().describe("State"),
    pincode: z.string().describe("Postal code"),
    towerCount: z.number().describe("Number of towers in the society"),
    upiVpa: z
      .string()
      .nullable()
      .describe("Society's UPI ID for direct payments; null means residents pay offline only"),
    payoutStatus: z
      .enum(["NOT_STARTED", "CREATED", "ACTIVE", "SUSPENDED"])
      .describe(
        "Razorpay Route onboarding state. Only ACTIVE can receive gateway money — CREATED " +
          "means the linked account exists but its KYC form is still outstanding",
      ),
    gatewayReady: z
      .boolean()
      .describe("Whether residents can be offered the gateway rail right now"),
  })
  .describe("A housing society");

const TowerModel = z
  .object({
    id: z.string().describe("Tower id"),
    name: z.string().describe("Tower name/number, unique within the society"),
    flatCount: z.number().describe("Number of flats in the tower"),
  })
  .describe("A tower within the society");

const FlatModel = z
  .object({
    id: z.string().describe("Flat id"),
    towerId: z.string().describe("Id of the tower the flat is in"),
    towerName: z.string().describe("Name of the tower the flat is in"),
    flatNumber: z.string().describe("Flat number, unique within the tower"),
    floor: z.number().describe("Floor the flat is on"),
    type: FlatTypeEnum,
    residentCount: z.number().describe("Number of residents linked to the flat"),
    isOccupied: z
      .boolean()
      .describe(
        "The flat already has a primary resident and cannot be allotted again — " +
          "admin pickers grey these out and resident.invite rejects them",
      ),
  })
  .describe("A flat within a tower");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const UpdateSocietyInput = z.object({
  name: z.string().min(1).describe("New society name").optional(),
  logoUrl: z.url().nullish().describe("New logo URL (Cloudinary LOGO kind); null clears it"),
  address: z.string().min(1).describe("New street address").optional(),
  city: z.string().min(1).describe("New city").optional(),
  state: z.string().min(1).describe("New state").optional(),
  pincode: z.string().min(1).describe("New postal code").optional(),
  upiVpa: z
    .string()
    .nullish()
    .describe("Society's UPI ID (name@bank) for direct payments; null clears it"),
});

const CreateTowerInput = z.object({
  name: z.string().min(1).describe("Tower name/number, unique within the society"),
});

const UpdateTowerInput = z.object({
  towerId: z.string().describe("Id of the tower to rename"),
  name: z.string().min(1).describe("New tower name, unique within the society"),
});

const CreateFlatInput = z.object({
  towerId: z.string().describe("Tower the flat belongs to"),
  flatNumber: z.string().min(1).describe("Flat number, unique within the tower"),
  floor: z.number().int().describe("Floor the flat is on"),
  type: FlatTypeEnum,
});

const UpdateFlatInput = z.object({
  flatId: z.string().describe("Id of the flat to update"),
  flatNumber: z.string().min(1).describe("New flat number, unique within the tower").optional(),
  floor: z.number().int().describe("New floor").optional(),
  type: FlatTypeEnum.optional(),
});

const ListFlatsInput = z.object({
  towerId: z.string().describe("Only list flats in this tower").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (max 100)"),
  cursor: z.string().describe("Id of the last flat from the previous page").optional(),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const societyRouter = router({
  get: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: societyPath(""),
        tags: ["Society"],
        summary: "Get the admin's society",
        description:
          "Returns the calling admin's society details. Errors: 401 if not authenticated, " +
          "403 if not an admin, 412 if the account is not linked to a society.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(SocietyModel)
    .query(({ ctx }) => societyService.getSociety(ctx.user)),

  update: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: societyPath(""),
        tags: ["Society"],
        summary: "Update the admin's society details",
        description:
          "Partially updates the calling admin's society (name, address, city, state, pincode). " +
          "Societies are created via seeding for MVP — there is no create endpoint. " +
          "Errors: 401 if not authenticated, 403 if not an admin.",
        protect: true,
      },
    })
    .input(UpdateSocietyInput)
    .output(SocietyModel)
    .mutation(({ ctx, input }) => societyService.updateSociety(ctx.user, input)),
});

export const towerRouter = router({
  create: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: towerPath(""),
        tags: ["Society"],
        summary: "Create a tower",
        description:
          "Creates a tower in the calling admin's society. Errors: 403 if not an admin, " +
          "409 if a tower with the same name already exists in the society.",
        protect: true,
      },
    })
    .input(CreateTowerInput)
    .output(TowerModel)
    .mutation(({ ctx, input }) => societyService.createTower(ctx.user, input)),

  update: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: towerPath("{towerId}"),
        tags: ["Society"],
        summary: "Rename a tower",
        description:
          "Renames a tower in the calling admin's society. Errors: 403 if not an admin, " +
          "404 if the tower does not exist in the admin's society, 409 if the new name is taken.",
        protect: true,
      },
    })
    .input(UpdateTowerInput)
    .output(TowerModel)
    .mutation(({ ctx, input }) => societyService.updateTower(ctx.user, input)),

  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: towerPath(""),
        tags: ["Society"],
        summary: "List the society's towers",
        description:
          "Lists every tower in the calling admin's society with flat counts, sorted by name. " +
          "Errors: 403 if not an admin.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(z.array(TowerModel))
    .query(({ ctx }) => societyService.listTowers(ctx.user)),
});

export const flatRouter = router({
  create: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: flatPath(""),
        tags: ["Society"],
        summary: "Create a flat",
        description:
          "Creates a flat in a tower of the calling admin's society. Errors: 403 if not an admin, " +
          "404 if the tower does not exist in the admin's society, 409 if the flat number is taken " +
          "in that tower.",
        protect: true,
      },
    })
    .input(CreateFlatInput)
    .output(FlatModel)
    .mutation(({ ctx, input }) => societyService.createFlat(ctx.user, input)),

  update: subscribedAdminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: flatPath("{flatId}"),
        tags: ["Society"],
        summary: "Update a flat",
        description:
          "Partially updates a flat (number, floor, type) in the calling admin's society. " +
          "Errors: 403 if not an admin, 404 if the flat does not exist in the admin's society, " +
          "409 if the new flat number is taken in its tower.",
        protect: true,
      },
    })
    .input(UpdateFlatInput)
    .output(FlatModel)
    .mutation(({ ctx, input }) => societyService.updateFlat(ctx.user, input)),

  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: flatPath(""),
        tags: ["Society"],
        summary: "List the society's flats",
        description:
          "Cursor-paginated list of flats in the calling admin's society, optionally filtered " +
          "by tower, sorted by tower then flat number. Errors: 403 if not an admin, 404 if the " +
          "towerId filter does not exist in the admin's society.",
        protect: true,
      },
    })
    .input(ListFlatsInput)
    .output(
      z.object({
        items: z.array(FlatModel).describe("Flats on this page"),
        nextCursor: z
          .string()
          .nullable()
          .describe("Cursor for the next page; null when there are no more pages"),
      }),
    )
    .query(({ ctx, input }) => societyService.listFlats(ctx.user, input)),
});
