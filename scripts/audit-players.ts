import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function auditPlayers() {
  console.log("🕵️‍♂️ Starting Data Audit...");

  // 1. Fetch all teams with players and their relations
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      players: {
        include: {
          playerMappings: true, 
          externalStats: {
            take: 1, 
          },
        },
      },
    },
  });

  console.log(`\n📊 TEAM SUMMARY (FPL Total vs Mapped vs No Stats)`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(
    `| ${"Team".padEnd(20)} | ${"FPL Total".padEnd(10)} | ${"Unmapped".padEnd(10)} | ${"No Stats".padEnd(10)} |`
  );
  console.log(`--------------------------------------------------------------------------------`);

  const unmappedPlayers: string[] = [];
  const noStatsPlayers: string[] = [];

  // Iterate over teams (cast to any[] to avoid strict type checks in this script)
  for (const team of teams as any[]) {
    const total = team.players?.length || 0;
    
    const unmapped = team.players?.filter((p: any) => p.playerMappings.length === 0) || [];
    
    const noStats = team.players?.filter(
      (p: any) => p.playerMappings.length > 0 && p.externalStats.length === 0
    ) || [];

    console.log(
      `| ${team.name.padEnd(20)} | ${total.toString().padEnd(10)} | ${unmapped.length
        .toString()
        .padEnd(10)} | ${noStats.length.toString().padEnd(10)} |`
    );

    if (unmapped.length > 0) {
      unmappedPlayers.push(...unmapped.map((p: any) => `[${team.shortName}] ${p.webName} (${p.firstName} ${p.secondName})`));
    }
    if (noStats.length > 0) {
      noStatsPlayers.push(...noStats.map((p: any) => `[${team.shortName}] ${p.webName}`));
    }
  }

  console.log(`--------------------------------------------------------------------------------`);

  if (unmappedPlayers.length > 0) {
    console.log(`\n❌ UNMAPPED PLAYERS (Exist in FPL, missing in Understat link):`);
    console.log(`Total: ${unmappedPlayers.length}`);
    unmappedPlayers.forEach((name) => console.log(` - ${name}`));
    console.log(`\n💡 ACTION: Check 'lib/services/playerMapper.ts' logic or add manual mapping.`);
  } else {
    console.log(`\n✅ All players are mapped successfully!`);
  }

  if (noStatsPlayers.length > 0) {
    console.log(`\n⚠️ MAPPED BUT NO STATS (Linked, but ExternalPlayerStats table is empty):`);
    console.log(`Total: ${noStatsPlayers.length}`);
    noStatsPlayers.forEach((name) => console.log(` - ${name}`));
    console.log(`\n💡 ACTION: Run 'sync-understat.ts' again or check if they played this season.`);
  }

  console.log(`\n🔍 PREDICTION VISIBILITY CHECK`);
  
  // Example check for Man Utd
  const manu = teams.find(t => t.shortName === "MUN" || t.name.includes("Man Utd"));
  if (manu) {
    console.log(`\nChecking ${manu.name} roster filtering logic:`);
    // Cast players to any to avoid type errors in loop
    for (const p of (manu as any).players) {
        const chance = p.chanceOfPlaying ?? 100;
        let status = "✅ Visible";
        if (chance === 0) status = "🚫 Hidden (Injury)";
        
        console.log(` - ${p.webName.padEnd(20)} [Chance: ${chance}%] -> ${status}`);
    }
  }

  await prisma.$disconnect();
}

auditPlayers();