import { profileService } from "@repo/services";

import { phoneSchema, z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, residentProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const profilePath = generatePath("v1/profile");
const familyPath = generatePath("v1/family-members");
const vehiclePath = generatePath("v1/vehicles");

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const VehicleTypeEnum = z.enum(["CAR", "BIKE", "OTHER"]).describe("Vehicle type");

const FamilyMemberModel = z
  .object({
    id: z.string().describe("Family member id"),
    name: z.string().describe("Full name"),
    relation: z.string().describe("Relation to the resident, e.g. 'spouse'"),
    age: z.number().nullable().describe("Age in years, if given"),
    photoUrl: z.string().nullable().describe("Photo URL, if set"),
  })
  .describe("A family member of a resident");

const VehicleModel = z
  .object({
    id: z.string().describe("Vehicle id"),
    number: z.string().describe("Vehicle registration number"),
    type: VehicleTypeEnum,
  })
  .describe("A resident's vehicle");

const MyProfileModel = z
  .object({
    id: z.string().describe("User id"),
    name: z.string().describe("Full name"),
    email: z.string().nullable().describe("Email, if set"),
    phone: z.string().nullable().describe("Phone, if set"),
    role: z.enum(["RESIDENT", "GUARD", "ADMIN"]).describe("Account role"),
    avatarUrl: z.string().nullable().describe("Profile photo URL, if set"),
    emergencyContactName: z.string().nullable().describe("Emergency contact name, if set"),
    emergencyContactPhone: z.string().nullable().describe("Emergency contact phone, if set"),
    society: z
      .object({
        id: z.string().describe("Society id"),
        name: z.string().describe("Society name"),
      })
      .nullable()
      .describe("The user's society, if linked"),
    residentProfile: z
      .object({
        flatId: z.string().describe("Id of the resident's flat"),
        flatNumber: z.string().describe("Flat number"),
        towerName: z.string().describe("Tower name"),
        isPrimaryResident: z.boolean().describe("Whether this is the flat's primary resident"),
        moveInDate: z.string().nullable().describe("ISO move-in date, if set"),
        familyMembers: z.array(FamilyMemberModel).describe("Registered family members"),
        vehicles: z.array(VehicleModel).describe("Registered vehicles"),
      })
      .nullable()
      .describe("Resident details — null unless role is RESIDENT"),
    guardProfile: z
      .object({
        gateAssigned: z.string().nullable().describe("Assigned gate, if set"),
        shiftStart: z.string().nullable().describe("Shift start 'HH:mm', if set"),
        shiftEnd: z.string().nullable().describe("Shift end 'HH:mm', if set"),
      })
      .nullable()
      .describe("Guard details — null unless role is GUARD"),
    adminProfile: z
      .object({
        designation: z.string().nullable().describe("Designation, e.g. 'Secretary', if set"),
      })
      .nullable()
      .describe("Admin details — null unless role is ADMIN"),
  })
  .describe("Role-aware profile of the calling user");

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const UpdateProfileInput = z.object({
  name: z.string().min(1).describe("New display name").optional(),
  avatarUrl: z.url().describe("New profile photo URL (Cloudinary, Phase 9)").optional(),
  emergencyContactName: z.string().min(1).describe("Emergency contact name").optional(),
  emergencyContactPhone: phoneSchema.describe("Emergency contact's 10-digit phone").optional(),
});

const AddFamilyMemberInput = z.object({
  name: z.string().min(1).describe("Full name"),
  relation: z.string().min(1).describe("Relation to the resident, e.g. 'spouse'"),
  age: z.number().int().min(0).max(130).describe("Age in years").optional(),
  photoUrl: z.url().describe("Photo URL").optional(),
});

const UpdateFamilyMemberInput = z.object({
  familyMemberId: z.string().describe("Id of the family member to update"),
  name: z.string().min(1).describe("New name").optional(),
  relation: z.string().min(1).describe("New relation").optional(),
  age: z.number().int().min(0).max(130).describe("New age").optional(),
  photoUrl: z.url().describe("New photo URL").optional(),
});

const FamilyMemberIdInput = z.object({
  familyMemberId: z.string().describe("Id of the family member to remove"),
});

const AddVehicleInput = z.object({
  number: z.string().min(1).describe("Vehicle registration number"),
  type: VehicleTypeEnum,
});

const UpdateVehicleInput = z.object({
  vehicleId: z.string().describe("Id of the vehicle to update"),
  number: z.string().min(1).describe("New registration number").optional(),
  type: VehicleTypeEnum.optional(),
});

const VehicleIdInput = z.object({
  vehicleId: z.string().describe("Id of the vehicle to remove"),
});

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

// ---------------------------------------------------------------------------
// Routers
// ---------------------------------------------------------------------------

export const profileRouter = router({
  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: profilePath("me"),
        tags: ["Profile"],
        summary: "Get the caller's full profile",
        description:
          "Returns the calling user's profile with the sub-profile matching their role " +
          "(resident: flat + family + vehicles; guard: gate + shift; admin: designation). " +
          "Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(zodUndefinedModel)
    .output(MyProfileModel)
    .query(({ ctx }) => profileService.getMyProfile(ctx.user)),

  update: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: profilePath("me"),
        tags: ["Profile"],
        summary: "Update the caller's profile",
        description:
          "Partially updates name, avatar URL, and emergency contact of the calling user " +
          "(any role). Errors: 401 if not authenticated.",
        protect: true,
      },
    })
    .input(UpdateProfileInput)
    .output(MyProfileModel)
    .mutation(({ ctx, input }) => profileService.updateMyProfile(ctx.user, input)),
});

export const familyMemberRouter = router({
  add: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: familyPath(""),
        tags: ["Profile"],
        summary: "Add a family member",
        description:
          "Adds a family member to the calling resident's profile. Errors: 403 if not a " +
          "resident, 412 if the account has no resident profile.",
        protect: true,
      },
    })
    .input(AddFamilyMemberInput)
    .output(FamilyMemberModel)
    .mutation(({ ctx, input }) => profileService.addFamilyMember(ctx.user, input)),

  update: residentProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: familyPath("{familyMemberId}"),
        tags: ["Profile"],
        summary: "Update a family member",
        description:
          "Partially updates one of the calling resident's family members. Errors: 403 if not " +
          "a resident, 404 if the family member does not belong to the caller.",
        protect: true,
      },
    })
    .input(UpdateFamilyMemberInput)
    .output(FamilyMemberModel)
    .mutation(({ ctx, input }) => profileService.updateFamilyMember(ctx.user, input)),

  remove: residentProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: familyPath("{familyMemberId}"),
        tags: ["Profile"],
        summary: "Remove a family member",
        description:
          "Removes one of the calling resident's family members. Errors: 403 if not a " +
          "resident, 404 if the family member does not belong to the caller.",
        protect: true,
      },
    })
    .input(FamilyMemberIdInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await profileService.removeFamilyMember(ctx.user, input);
      return { success: true as const };
    }),
});

export const vehicleRouter = router({
  add: residentProcedure
    .meta({
      openapi: {
        method: "POST",
        path: vehiclePath(""),
        tags: ["Profile"],
        summary: "Register a vehicle",
        description:
          "Registers a vehicle on the calling resident's profile. Errors: 403 if not a " +
          "resident, 409 if the number is already registered on this profile.",
        protect: true,
      },
    })
    .input(AddVehicleInput)
    .output(VehicleModel)
    .mutation(({ ctx, input }) => profileService.addVehicle(ctx.user, input)),

  update: residentProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: vehiclePath("{vehicleId}"),
        tags: ["Profile"],
        summary: "Update a vehicle",
        description:
          "Partially updates one of the calling resident's vehicles. Errors: 403 if not a " +
          "resident, 404 if the vehicle does not belong to the caller, 409 if the new number " +
          "is already registered.",
        protect: true,
      },
    })
    .input(UpdateVehicleInput)
    .output(VehicleModel)
    .mutation(({ ctx, input }) => profileService.updateVehicle(ctx.user, input)),

  remove: residentProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: vehiclePath("{vehicleId}"),
        tags: ["Profile"],
        summary: "Remove a vehicle",
        description:
          "Removes one of the calling resident's vehicles. Errors: 403 if not a resident, " +
          "404 if the vehicle does not belong to the caller.",
        protect: true,
      },
    })
    .input(VehicleIdInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await profileService.removeVehicle(ctx.user, input);
      return { success: true as const };
    }),
});
