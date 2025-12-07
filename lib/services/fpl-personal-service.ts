import { prisma } from "@/lib/db";
import { getEntry, getEntryPicks } from "@/lib/fplClient";

export class FPLPersonalService {
  /**
   * Syncs a user's FPL team data for the current gameweek.
   */
  async syncUserTeam(fplTeamId: number) {
    try {
      // 1. Fetch basic entry info
      const entry = await getEntry(fplTeamId);
      const currentGw = entry.current_event;

      if (!currentGw) {
        throw new Error("No current gameweek found");
      }

      // 2. Ensure User exists
      // We use a placeholder email if it doesn't exist, assuming the user might update it later
      // or we rely on FPL ID as the main identifier for now.
      const user = await prisma.user.upsert({
        where: { fplTeamId },
        update: {
          name: `${entry.player_first_name} ${entry.player_last_name}`,
        },
        create: {
          fplTeamId,
          email: `fpluser_${fplTeamId}@placeholder.com`, // Temporary placeholder
          name: `${entry.player_first_name} ${entry.player_last_name}`,
        },
      });

      // 3. Fetch Picks for current GW
      const picksData = await getEntryPicks(fplTeamId, currentGw);
      const entryHistory = picksData.entry_history;
      const picks = picksData.picks;

      // 4. Create/Update FantasyTeam for this GW
      const fantasyTeam = await prisma.fantasyTeam.upsert({
        where: {
          userId_gameweek: {
            userId: user.id,
            gameweek: currentGw,
          },
        },
        update: {
          teamValue: entryHistory.value,
          bank: entryHistory.bank,
          freeTransfers: 1, // API doesn't explicitly give FT count in picks endpoint, usually inferred or tracked separately. For MVP assume 1 or logic needed.
          // Actually, 'transfers' endpoint gives history. For now, we'll just store what we have.
          pointsHit: entryHistory.event_transfers_cost,
          gameweekPoints: entryHistory.points,
          totalPoints: entryHistory.total_points,
          gameweekRank: entryHistory.rank,
          overallRank: entryHistory.overall_rank,
          
          // Chips
          wildcardAvailable: true, // TODO: Logic to check chip usage history
          freeHitAvailable: true,
          benchBoostAvailable: true,
          tripleCaptainAvailable: true,
        },
        create: {
          userId: user.id,
          gameweek: currentGw,
          teamValue: entryHistory.value,
          bank: entryHistory.bank,
          freeTransfers: 1, // Default assumption
          pointsHit: entryHistory.event_transfers_cost,
          gameweekPoints: entryHistory.points,
          totalPoints: entryHistory.total_points,
          gameweekRank: entryHistory.rank,
          overallRank: entryHistory.overall_rank,
        },
      });

      // 5. Save Picks
      // First delete existing picks for this team/gw to avoid conflicts/duplicates on re-sync
      await prisma.fantasyTeamPick.deleteMany({
        where: { fantasyTeamId: fantasyTeam.id },
      });

      for (const pick of picks) {
        // Find internal player ID by FPL ID
        const player = await prisma.player.findUnique({
          where: { fplId: pick.element },
        });

        if (player) {
          await prisma.fantasyTeamPick.create({
            data: {
              fantasyTeamId: fantasyTeam.id,
              playerId: player.id,
              position: pick.position,
              isCaptain: pick.is_captain,
              isViceCaptain: pick.is_vice_captain,
              multiplier: pick.multiplier,
              purchasePrice: pick.purchase_price,
              sellingPrice: pick.selling_price,
            },
          });
        } else {
          console.warn(`Player with FPL ID ${pick.element} not found in DB`);
        }
      }

      return fantasyTeam;
    } catch (error) {
      console.error("Error syncing user team:", error);
      throw error;
    }
  }

  /**
   * Get the squad state for a user, optionally for a specific gameweek.
   */
  async getSquad(userId: number, gameweek?: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        fantasyTeams: {
          where: gameweek ? { gameweek } : undefined,
          orderBy: { gameweek: "desc" },
          take: 1,
        }
      }
    });

    if (!user || user.fantasyTeams.length === 0) {
      return null;
    }

    const targetTeam = user.fantasyTeams[0];
    const targetGw = targetTeam.gameweek;

    // Fetch picks with stats for the specific gameweek
    const picks = await prisma.fantasyTeamPick.findMany({
      where: { fantasyTeamId: targetTeam.id },
      include: {
        player: {
          include: {
            team: true,
            fplStats: {
              where: { gameweek: targetGw },
              take: 1
            }
          }
        }
      },
      orderBy: { position: "asc" }
    });

    // Reconstruct the response structure to match what the frontend expects
    return {
      ...targetTeam,
      picks: picks
    };
  }
}
