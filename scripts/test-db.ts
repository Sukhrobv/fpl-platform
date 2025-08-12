// scripts/test-db.ts - Test database connection and basic operations
import { prisma, connectDB, disconnectDB } from "@/lib/db";

async function testDatabase() {
  console.log("🔍 Testing database connection...\n");

  try {
    // Test connection
    const connected = await connectDB();
    if (!connected) {
      throw new Error("Failed to connect to database");
    }

    // Test creating a team
    console.log("📝 Creating test team...");
    const team = await prisma.team.create({
      data: {
        fplId: 999,
        name: "Test FC",
        shortName: "TST",
      },
    });
    console.log("✅ Team created:", team.name);

    // Test creating a player
    console.log("\n📝 Creating test player...");
    const player = await prisma.player.create({
      data: {
        fplId: 99999,
        code: 99999,
        webName: "Test Player",
        firstName: "Test",
        secondName: "Player",
        position: "MIDFIELDER",
        teamId: team.id,
        nowCost: 100,
        selectedBy: 5.5,
        totalPoints: 0,
        pointsPerGame: 0,
        form: 0,
      },
    });
    console.log("✅ Player created:", player.webName);

    // Test reading
    console.log("\n📖 Reading data...");
    const playerCount = await prisma.player.count();
    const teamCount = await prisma.team.count();
    console.log(`Found ${playerCount} players and ${teamCount} teams`);

    // Clean up test data
    console.log("\n🧹 Cleaning up test data...");
    await prisma.player.delete({ where: { id: player.id } });
    await prisma.team.delete({ where: { id: team.id } });
    console.log("✅ Test data cleaned up");

    console.log("\n✨ All database tests passed!");

  } catch (error) {
    console.error("\n❌ Database test failed:", error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Run the test
testDatabase();