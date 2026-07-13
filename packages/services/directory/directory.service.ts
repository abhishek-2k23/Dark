import { TRPCError } from "@trpc/server";
import { prisma, type User, type ServiceCategory } from "@repo/database";
import { assertCloudinaryUrl } from "@repo/cloudinary";

/**
 * Staff/service directory: maids, electricians, plumbers, drivers, etc.
 * that residents can look up. Admins manage entries and vouch for them via
 * `isVerified`.
 */

export interface ServiceProviderInfo {
  id: string;
  name: string;
  category: ServiceCategory;
  phone: string;
  photoUrl: string | null;
  isVerified: boolean;
}

function toInfo(provider: {
  id: string;
  name: string;
  category: ServiceCategory;
  phone: string;
  photoUrl: string | null;
  isVerified: boolean;
}): ServiceProviderInfo {
  return {
    id: provider.id,
    name: provider.name,
    category: provider.category,
    phone: provider.phone,
    photoUrl: provider.photoUrl,
    isVerified: provider.isVerified,
  };
}

function actorSocietyId(actor: User): string {
  if (!actor.societyId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Your account is not linked to a society",
    });
  }
  return actor.societyId;
}

export async function createServiceProvider(
  actor: User,
  input: {
    name: string;
    category: ServiceCategory;
    phone: string;
    photoUrl?: string;
    isVerified?: boolean;
  },
): Promise<ServiceProviderInfo> {
  assertCloudinaryUrl(input.photoUrl);
  const societyId = actorSocietyId(actor);
  const provider = await prisma.serviceProvider.create({
    data: {
      societyId,
      name: input.name,
      category: input.category,
      phone: input.phone,
      photoUrl: input.photoUrl,
      isVerified: input.isVerified ?? false,
      addedByAdminId: actor.id,
    },
  });
  return toInfo(provider);
}

async function requireOwnSocietyProvider(actor: User, serviceProviderId: string) {
  const provider = await prisma.serviceProvider.findFirst({
    where: { id: serviceProviderId, societyId: actorSocietyId(actor) },
  });
  if (!provider) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Service provider not found" });
  }
  return provider;
}

export async function updateServiceProvider(
  actor: User,
  input: {
    serviceProviderId: string;
    name?: string;
    category?: ServiceCategory;
    phone?: string;
    photoUrl?: string;
    isVerified?: boolean;
  },
): Promise<ServiceProviderInfo> {
  assertCloudinaryUrl(input.photoUrl);
  const provider = await requireOwnSocietyProvider(actor, input.serviceProviderId);
  const updated = await prisma.serviceProvider.update({
    where: { id: provider.id },
    data: {
      name: input.name,
      category: input.category,
      phone: input.phone,
      photoUrl: input.photoUrl,
      isVerified: input.isVerified,
    },
  });
  return toInfo(updated);
}

export async function deleteServiceProvider(
  actor: User,
  input: { serviceProviderId: string },
): Promise<void> {
  const provider = await requireOwnSocietyProvider(actor, input.serviceProviderId);
  await prisma.serviceProvider.delete({ where: { id: provider.id } });
}

export async function listServiceProviders(
  actor: User,
  input: { category?: ServiceCategory },
): Promise<ServiceProviderInfo[]> {
  const societyId = actorSocietyId(actor);
  const providers = await prisma.serviceProvider.findMany({
    where: { societyId, ...(input.category ? { category: input.category } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return providers.map(toInfo);
}
