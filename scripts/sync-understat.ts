import { PrismaClient } from '@prisma/client';
import { UnderstatCollector } from '../lib/collectors/understatCollector';
import { findBestMatch, normalizeName } from '../lib/services/playerMapper';

const prisma = new PrismaClient();
const collector = new UnderstatCollector();

async function syncUnderstat() {
  console.log('🚀 Starting Understat Sync...');
  
  try {
    // 1. Fetch Data
    const players = await collector.getLeaguePlayers('EPL', 2024);
    console.log(`📥 Fetched ${players.length} players from Understat`);

    // 2. Get FPL Players for mapping
    const fplPlayers = await prisma.player.findMany({
      select: { id: true, webName: true, firstName: true, secondName: true, team: { select: { name: true, shortName: true } } }
    });
    
    // Prepare candidates for fuzzy matching
    const candidates = fplPlayers.map(p => ({
      id: p.id.toString(),
      name: `${p.firstName} ${p.secondName}`, // Full name usually works best
      webName: p.webName,
      team: p.team.name
    }));

    let mappedCount = 0;
    let statsUpdated = 0;

    // 3. Process each Understat player
    for (const uPlayer of players) {
      // Try to find existing mapping
      let mapping = await prisma.playerMapping.findFirst({
        where: { source: 'understat', externalId: uPlayer.id }
      });

      let fplPlayerId: number | null = mapping?.playerId || null;

      // If no mapping, try to find one
      if (!fplPlayerId) {
        // Filter candidates by team if possible to reduce false positives
        // Understat team names: "Arsenal", "Aston Villa", "Liverpool", etc.
        // FPL team names: "Arsenal", "Aston Villa", "Liverpool", etc.
        // They usually match well.
        
        // Simple team normalization/check could help, but let's rely on name first + team verification if needed.
        // Actually, filtering by team is SAFER.
        
        const teamCandidates = candidates.filter(c => {
            // Very basic team name check. 
            // uPlayer.team_title: "Manchester United"
            // c.team: "Man Utd" -> mismatch.
            // We need a team mapper too, but for now let's try global match and check team later?
            // Or just global match.
            return true; 
        });

        const match = findBestMatch(uPlayer.player_name, teamCandidates);
        
        if (match && match.confidence > 0.7) {
           fplPlayerId = parseInt(match.candidateId);
           
           // Check if this FPL player is already mapped to Understat
           const existingMapping = await prisma.playerMapping.findUnique({
             where: {
               playerId_source: {
                 playerId: fplPlayerId,
                 source: 'understat'
               }
             }
           });

           if (existingMapping) {
             // Update existing mapping if externalId is different
             if (existingMapping.externalId !== uPlayer.id) {
                console.log(`🔄 Updating mapping for ${uPlayer.player_name} (ID: ${existingMapping.externalId} -> ${uPlayer.id})`);
                await prisma.playerMapping.update({
                    where: { id: existingMapping.id },
                    data: { externalId: uPlayer.id }
                });
             }
           } else {
               // Create new mapping
               await prisma.playerMapping.create({
                 data: {
                   playerId: fplPlayerId,
                   source: 'understat',
                   externalId: uPlayer.id,
                   method: match.method === 'EXACT' ? 'EXACT_MATCH' : 'FUZZY_MATCH',
                   confidence: match.confidence,
                   status: 'PENDING'
                 }
               });
               mappedCount++;
           }
        } else {
            // console.log(`⚠️ Could not map: ${uPlayer.player_name} (${uPlayer.team_title})`);
        }
      }

      // 4. Save Stats if mapped
      if (fplPlayerId) {
        // Current Gameweek? Understat gives season totals in this endpoint.
        // We need per-match data for "ExternalPlayerStats" usually, but existing schema has xG/xA as floats.
        // If we want season totals, we might need a different table or store it in a "season" aggregation.
        // The `ExternalPlayerStats` table has `gameweek` and `matchId`.
        // The `playersData` endpoint returns SEASON TOTALS.
        
        // Wait, `ExternalPlayerStats` is designed for per-gameweek stats.
        // Storing season totals there with gameweek=0 or similar is a hack.
        // However, for now, maybe we just want to see the totals.
        
        // Actually, Understat has a `matchesData` variable or we can fetch player matches.
        // But for the "Predictive" feature (who is due), season totals (xG vs Goals) are very useful.
        // Where to store season totals?
        // Maybe add `xG`, `xA` to `Player` table? Or `PlayerStats` table?
        // Or just update `ExternalPlayerStats` for "Season 2024"?
        
        // Let's check schema again.
        // `ExternalPlayerStats` has `gameweek`.
        
        // Ideally we fetch match-by-match data from Understat to populate `ExternalPlayerStats` correctly.
        // But that requires fetching each player's page or the team's match page.
        // The `league` page has `datesData` which contains all matches.
        // Maybe we can get match stats from there?
        
        // For this task (Stage 3.3), let's focus on getting the DATA available.
        // If I can only get season totals easily, I will store them in a new table `PlayerSeasonStats` or similar,
        // OR just log them for now.
        
        // Actually, the user wants "Predictive metrics".
        // xG vs Goals (Season) is the #1 metric.
        
        // Let's upsert into `ExternalPlayerStats` with gameweek: 0 (representing season total) for now?
        // Or better, create a `PlayerAdvancedStats` table?
        
        // Let's stick to `ExternalPlayerStats` but maybe use a special gameweek like 999 or 0 for "Season Total".
        // OR, just fetch match data.
        // `UnderstatCollector` can fetch match data?
        // The `datesData` on the league page has match IDs.
        // `https://understat.com/match/{id}` has detailed shot data.
        
        // Let's start simple: Store SEASON TOTALS in `ExternalPlayerStats` with gameweek: 0.
        // This allows us to query "Season xG" easily.
        
        await prisma.externalPlayerStats.upsert({
          where: {
            playerId_gameweek_source: {
              playerId: fplPlayerId,
              gameweek: 0, // 0 = Season Total
              source: 'understat'
            }
          },
          create: {
            playerId: fplPlayerId,
            gameweek: 0,
            source: 'understat',
            minutes: parseInt(uPlayer.time),
            goals: parseInt(uPlayer.goals),
            assists: parseInt(uPlayer.assists),
            shots: parseInt(uPlayer.shots),
            keyPasses: parseInt(uPlayer.key_passes),
            xG: parseFloat(uPlayer.xG),
            xA: parseFloat(uPlayer.xA),
            xGChain: parseFloat(uPlayer.xGChain),
            xGBuildup: parseFloat(uPlayer.xGBuildup),
            matchDate: new Date(), // Now
            homeTeam: '',
            awayTeam: '',
            wasHome: false
          },
          update: {
            minutes: parseInt(uPlayer.time),
            goals: parseInt(uPlayer.goals),
            assists: parseInt(uPlayer.assists),
            shots: parseInt(uPlayer.shots),
            keyPasses: parseInt(uPlayer.key_passes),
            xG: parseFloat(uPlayer.xG),
            xA: parseFloat(uPlayer.xA),
            xGChain: parseFloat(uPlayer.xGChain),
            xGBuildup: parseFloat(uPlayer.xGBuildup),
            updatedAt: new Date()
          }
        });
        statsUpdated++;
      }
    }

    // 5. Process Team Stats
    console.log('📊 Syncing Team Stats...');
    const teamsData = await collector.getLeagueTeams('EPL', 2024);
    let teamStatsUpdated = 0;

    // Map Understat team names to FPL team names (or use DB mapping if we had it)
    // For now, we use a simple static map or fuzzy match if needed.
    // FPL Teams: "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea", "Crystal Palace", "Everton", "Fulham", "Ipswich", "Leicester", "Liverpool", "Man City", "Man Utd", "Newcastle", "Nott'm Forest", "Southampton", "Spurs", "West Ham", "Wolves"
    // Understat Teams: "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton", "Chelsea", "Crystal Palace", "Everton", "Fulham", "Ipswich", "Leicester", "Liverpool", "Manchester City", "Manchester United", "Newcastle United", "Nottingham Forest", "Southampton", "Tottenham", "West Ham", "Wolverhampton Wanderers"
    
    const teamNameMap: Record<string, string> = {
        "Manchester City": "Man City",
        "Manchester United": "Man Utd",
        "Newcastle United": "Newcastle",
        "Nottingham Forest": "Nott'm Forest",
        "Tottenham": "Spurs",
        "Wolverhampton Wanderers": "Wolves"
    };

    for (const [understatId, teamData] of Object.entries(teamsData)) {
        const understatName = teamData.title;
        const fplName = teamNameMap[understatName] || understatName;
        
        const fplTeam = await prisma.team.findFirst({
            where: { name: fplName }
        });

        if (!fplTeam) {
            console.warn(`⚠️ Could not find FPL team for Understat team: ${understatName} (Mapped to: ${fplName})`);
            continue;
        }

        // Update Team mapping if needed
        if (!fplTeam.understatId) {
            await prisma.team.update({
                where: { id: fplTeam.id },
                data: { understatId: understatId }
            });
        }

        // Process match history
        for (const match of teamData.history) {
            // match.date is "2024-08-16 19:00:00"
            const matchDate = new Date(match.date);
            
            await prisma.externalTeamStats.upsert({
                where: {
                    teamId_matchDate_source: {
                        teamId: fplTeam.id,
                        matchDate: matchDate,
                        source: 'understat'
                    }
                },
                create: {
                    teamId: fplTeam.id,
                    gameweek: 0, // We don't have GW easily here without mapping dates to GWs. 0 for now.
                    source: 'understat',
                    matchDate: matchDate,
                    isHome: match.h_a === 'h',
                    goals: match.scored,
                    goalsConceded: match.missed,
                    xG: match.xG,
                    xGA: match.xGA,
                    npxG: match.npxG,
                    npxGA: match.npxGA,
                    deep: match.deep,
                    deepAllowed: match.deep_allowed,
                    ppda: match.ppda.att,      // Our pressing intensity (lower is more intense)
                    ppdaAllowed: match.ppda_allowed.att, // Opponent's pressing intensity
                    xpts: match.xpts,
                    result: match.result,
                    points: match.pts
                },
                update: {
                    goals: match.scored,
                    goalsConceded: match.missed,
                    xG: match.xG,
                    xGA: match.xGA,
                    npxG: match.npxG,
                    npxGA: match.npxGA,
                    deep: match.deep,
                    deepAllowed: match.deep_allowed,
                    ppda: match.ppda.att,
                    ppdaAllowed: match.ppda_allowed.att,
                    xpts: match.xpts,
                    result: match.result,
                    points: match.pts
                }
            });
            teamStatsUpdated++;
        }
    }

    console.log(`✅ Sync Complete.`);
    console.log(`   - Mapped New Players: ${mappedCount}`);
    console.log(`   - Player Stats Updated: ${statsUpdated}`);
    console.log(`   - Team Stats Entries: ${teamStatsUpdated}`);

  } catch (error) {
    console.error('❌ Sync Failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncUnderstat();
