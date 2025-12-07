
import { syncFplData } from "../lib/services/fplSync";
import { prisma } from "../lib/db";

async function main() {
  console.log("Starting GW14 stats sync...");
  
  try {
    const summary = await syncFplData({
      events: [14] // Sync GW14 specifically
    });
    
    console.log("Sync complete:", summary);
  } catch (error) {
    console.error("Sync failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
