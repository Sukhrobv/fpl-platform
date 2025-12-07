
import { TransferAdvisorService } from "../lib/services/transfer-advisor-service";
import { prisma } from "../lib/db";

async function main() {
  console.log("Testing Transfer Recommendations...");
  
  // Find a user with a squad
  const user = await prisma.user.findFirst({
    where: { fantasyTeams: { some: {} } }
  });

  if (!user) {
    console.log("No user found with a squad.");
    return;
  }

  console.log(`Generating recommendations for User ID: ${user.id}`);
  const service = new TransferAdvisorService();
  const recs = await service.generateRecommendations(user.id);

  console.log(`Generated ${recs.length} recommendations:`);
  recs.forEach((rec, i) => {
    console.log(`\nRecommendation #${i + 1}:`);
    console.log(`  OUT: ${rec.playerOut.webName} (${rec.playerOut.team.shortName}) - xPts: ${rec.playerOut.xPts?.toFixed(2)}`);
    console.log(`  IN:  ${rec.playerIn.webName} (${rec.playerIn.team.shortName}) - xPts: ${rec.playerIn.xPts?.toFixed(2)}`);
    console.log(`  Delta: +${rec.xPtsDelta.toFixed(2)}`);
    console.log(`  Reason: ${rec.reason}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
