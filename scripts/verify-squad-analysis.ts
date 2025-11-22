import { SquadAnalysisService } from "../lib/services/squad-analysis-service";
import { prisma } from "../lib/db";

async function main() {
  const service = new SquadAnalysisService();
  
  // Get a user with a squad
  const user = await prisma.user.findFirst({
    where: { fantasyTeams: { some: {} } }
  });

  if (!user) {
    console.log("No user with squad found.");
    return;
  }

  console.log(`Analyzing squad for user ${user.id}...`);
  
  try {
    const analysis = await service.analyzeSquad(user.id);
    console.log("Analysis Result:");
    console.log(JSON.stringify(analysis, null, 2));
    
    if (analysis.health.score >= 0 && analysis.health.score <= 100) {
      console.log("Health score is valid.");
    } else {
      console.error("Invalid health score.");
    }
    
    if (Array.isArray(analysis.problems)) {
      console.log(`Found ${analysis.problems.length} problems.`);
    } else {
      console.error("Problems is not an array.");
    }

  } catch (error) {
    console.error("Error analyzing squad:", error);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
