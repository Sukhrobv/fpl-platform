import type { PrismaClient } from "@prisma/client";

export const PULSELIVE_ENRICHMENT_FLAG = "pulselive_enrichment_enabled";

export function parseFeatureFlag(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export async function isPulseLiveEnrichmentEnabled(
  prisma: PrismaClient,
): Promise<boolean> {
  const config = await prisma.appConfig.findUnique({
    where: { key: PULSELIVE_ENRICHMENT_FLAG },
    select: { value: true },
  });
  return parseFeatureFlag(config?.value);
}
