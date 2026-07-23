import { prisma } from "@/lib/db";

async function main() {
  const version = process.argv
    .slice(2)
    .find((arg) => arg.startsWith("--version="))
    ?.split("=", 2)[1];
  if (!version) {
    throw new Error(
      "Usage: tsx scripts/check-season-priors.ts --version=gw1-prior-v5",
    );
  }
  const config = await prisma.predictionConfigVersion.findUnique({
    where: { version },
  });
  if (!config) throw new Error(`Prediction config ${version} not found`);
  const freeze = await prisma.seasonEvidenceFreeze.findUnique({
    where: {
      seasonId_version: {
        seasonId: config.sourceSeasonId,
        version,
      },
    },
  });
  if (!freeze) throw new Error(`Evidence freeze ${version} not found`);
  const where = {
    sourceSeasonId: config.sourceSeasonId,
    configVersionId: config.id,
    targetSeasonCode: "2026/27",
  };
  const [
    priors,
    sourceRegistrations,
    invalidWeights,
    fabricatedXg,
    fabricatedXa,
    fabricatedTouches,
    fabricatedKeyPasses,
    fabricatedCarries,
    fabricatedDefcon,
    confirmedZeroKeyPasses,
    olderFrozen,
  ] = await Promise.all([
    prisma.playerSeasonPrior.count({ where }),
    prisma.seasonPlayer.count({
      where: { seasonId: config.sourceSeasonId },
    }),
    prisma.playerSeasonPrior.count({
      where: {
        ...where,
        OR: [
          { sampleWeight: { lt: 0 } },
          { sampleWeight: { gt: 1 } },
          { confidenceScore: { lt: 0 } },
          { confidenceScore: { gt: 1 } },
        ],
      },
    }),
    prisma.playerSeasonPrior.count({
      where: { ...where, rawXG90: null, xG90: { not: null } },
    }),
    prisma.playerSeasonPrior.count({
      where: { ...where, rawXA90: null, xA90: { not: null } },
    }),
    prisma.playerSeasonPrior.count({
      where: { ...where, rawTouches90: null, touches90: { not: null } },
    }),
    prisma.playerSeasonPrior.count({
      where: {
        ...where,
        rawKeyPasses90: null,
        keyPasses90: { not: null },
      },
    }),
    prisma.playerSeasonPrior.count({
      where: { ...where, rawCarries90: null, carries90: { not: null } },
    }),
    prisma.playerSeasonPrior.count({
      where: {
        ...where,
        rawDefconActions90: null,
        defconActions90: { not: null },
      },
    }),
    prisma.playerSeasonPrior.count({
      where: { ...where, rawKeyPasses90: 0, minutes: { gt: 0 } },
    }),
    prisma.seasonEvidenceFreeze.count({
      where: {
        seasonId: config.sourceSeasonId,
        version: { not: version },
        status: "FROZEN",
      },
    }),
  ]);
  const quality = freeze.qualityReport as {
    coverageRate?: Record<string, number>;
  };
  const requiredCoverage = [
    "xG90",
    "xA90",
    "touches90",
    "keyPasses90",
    "carries90",
    "defconActions90",
  ];
  const checks = {
    completeRoster: priors === sourceRegistrations,
    immutableCurrentVersion: freeze.status === "FROZEN",
    olderVersionsSuperseded: olderFrozen === 0,
    configFrozen: config.frozenAt != null,
    calibrationTruthful: config.calibrationStatus === "NOT_RUN",
    backtestDisclosure:
      (config.backtestResult as { status?: string } | null)?.status ===
      "NOT_RUN",
    validWeights: invalidWeights === 0,
    missingRemainsNull:
      fabricatedXg +
        fabricatedXa +
        fabricatedTouches +
        fabricatedKeyPasses +
        fabricatedCarries +
        fabricatedDefcon ===
      0,
    confirmedZerosPresent: confirmedZeroKeyPasses > 0,
    fullEligibleCoverage: requiredCoverage.every(
      (metric) => quality.coverageRate?.[metric] === 1,
    ),
  };
  const result = {
    version,
    configVersionId: config.id,
    freezeId: freeze.id,
    checksum: freeze.checksum,
    priors,
    sourceRegistrations,
    confirmedZeroKeyPasses,
    quality: freeze.qualityReport,
    checks,
    complete: Object.values(checks).every(Boolean),
  };
  console.log(JSON.stringify(result));
  if (!result.complete) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
