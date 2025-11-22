import { FPLPersonalService } from "../lib/services/fpl-personal-service";
import { TransferAdvisorService } from "../lib/services/transfer-advisor-service";
import { prisma } from "../lib/db";

async function main() {
  try {
    const fplId = 1; // Test ID (usually exists)
    console.log(`Syncing team ${fplId}...`);
    
    const personalService = new FPLPersonalService();
    const team = await personalService.syncUserTeam(fplId);
    console.log("Team synced successfully. Internal ID:", team.id);
    console.log("Team Value:", team.teamValue);
    
    const user = await prisma.user.findUnique({ where: { fplTeamId: fplId } });
    if (!user) throw new Error("User not found after sync");

    console.log("Generating recommendations for User ID:", user.id);
    
    const advisorService = new TransferAdvisorService();
    const recs = await advisorService.generateRecommendations(user.id);
    
    console.log(`Found ${recs.length} recommendations.`);
    if (recs.length > 0) {
      console.log("Top recommendation:", recs[0]);
      if (recs[0].ownershipContext) {
        console.log("Context:", recs[0].ownershipContext);
      } else {
        console.warn("WARNING: No ownership context found!");
      }
    } else {
      console.log("No recommendations found (might be early season or no better options).");
    }

  } catch (error) {
    console.error("Verification failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
