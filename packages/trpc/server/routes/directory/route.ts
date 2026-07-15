import { directoryService } from "@repo/services";

import { phoneSchema, z } from "../../schema";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const path = generatePath("v1/service-providers");

const ServiceCategoryEnum = z
  .enum(["MAID", "ELECTRICIAN", "PLUMBER", "DRIVER", "OTHER"])
  .describe("Service category");

const ServiceProviderModel = z
  .object({
    id: z.string().describe("Service provider id"),
    name: z.string().describe("Full name"),
    category: ServiceCategoryEnum,
    phone: z.string().describe("Contact phone number"),
    photoUrl: z.string().nullable().describe("Photo URL, if set"),
    isVerified: z.boolean().describe("Whether the society admin has verified this provider"),
  })
  .describe("A staff/service provider in the society directory");

const CreateProviderInput = z.object({
  name: z.string().min(1).describe("Full name"),
  category: ServiceCategoryEnum,
  phone: phoneSchema.describe("Contact's 10-digit phone number"),
  photoUrl: z.url().describe("Photo URL (Cloudinary, Phase 9)").optional(),
  isVerified: z.boolean().describe("Mark as admin-verified (default false)").optional(),
});

const UpdateProviderInput = z.object({
  serviceProviderId: z.string().describe("Id of the provider to update"),
  name: z.string().min(1).describe("New name").optional(),
  category: ServiceCategoryEnum.optional(),
  phone: phoneSchema.describe("New 10-digit phone").optional(),
  photoUrl: z.url().describe("New photo URL").optional(),
  isVerified: z.boolean().describe("New verification state").optional(),
});

const ProviderIdInput = z.object({
  serviceProviderId: z.string().describe("Id of the provider"),
});

const ListProvidersInput = z.object({
  category: ServiceCategoryEnum.describe("Only providers in this category").optional(),
});

const SuccessModel = z.object({
  success: z.literal(true).describe("Always true when the call succeeds"),
});

export const serviceProviderRouter = router({
  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path(""),
        tags: ["Directory"],
        summary: "Add a service provider to the directory",
        description:
          "Admin adds a maid/electrician/plumber/driver/etc. to their society's directory. " +
          "Errors: 403 if not an admin.",
        protect: true,
      },
    })
    .input(CreateProviderInput)
    .output(ServiceProviderModel)
    .mutation(({ ctx, input }) => directoryService.createServiceProvider(ctx.user, input)),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("{serviceProviderId}"),
        tags: ["Directory"],
        summary: "Update a service provider",
        description:
          "Partially updates a directory entry, including the isVerified flag. Errors: 403 " +
          "if not an admin, 404 if the provider is not in the admin's society.",
        protect: true,
      },
    })
    .input(UpdateProviderInput)
    .output(ServiceProviderModel)
    .mutation(({ ctx, input }) => directoryService.updateServiceProvider(ctx.user, input)),

  delete: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("{serviceProviderId}"),
        tags: ["Directory"],
        summary: "Remove a service provider",
        description:
          "Deletes a directory entry. Errors: 403 if not an admin, 404 if the provider is " +
          "not in the admin's society.",
        protect: true,
      },
    })
    .input(ProviderIdInput)
    .output(SuccessModel)
    .mutation(async ({ ctx, input }) => {
      await directoryService.deleteServiceProvider(ctx.user, input);
      return { success: true as const };
    }),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path(""),
        tags: ["Directory"],
        summary: "List the society's service providers",
        description:
          "Directory of the caller's society, sorted by category then name, optionally " +
          "filtered by category. Errors: 401 if not authenticated, 412 if the account is " +
          "not linked to a society.",
        protect: true,
      },
    })
    .input(ListProvidersInput)
    .output(z.array(ServiceProviderModel))
    .query(({ ctx, input }) => directoryService.listServiceProviders(ctx.user, input)),
});
