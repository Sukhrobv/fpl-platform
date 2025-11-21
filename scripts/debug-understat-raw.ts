
async function main() {
  console.log("🔍 Debugging Understat Base URL...");
  
  const url = 'https://understat.com/league/EPL';
  console.log(`Fetching ${url}...`);
  
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    let playersData: any[] = [];
    
    // Regex to find the playersData JSON string
    // It looks like: var playersData = JSON.parse('...');
    const match = html.match(/playersData\s*=\s*JSON\.parse\('([^']+)'\)/);
    
    if (match) {
      // Decode hex string
      const jsonString = match[1].replace(/\\x([0-9A-F]{2})/g, (_, p1) => 
        String.fromCharCode(parseInt(p1, 16))
      );
      playersData = JSON.parse(jsonString);
      console.log(`✅ Successfully parsed playersData.`);
    } else {
      console.log("❌ Could not find playersData in HTML.");
    }
    
    console.log(`Fetched ${playersData.length} players.`);
    
    if (playersData.length > 0) {
        const havertz = playersData.find(p => p.player_name.includes('Havertz'));
        if (havertz) {
          console.log("\n👤 Havertz Raw Data (Base URL):");
          console.log(JSON.stringify(havertz, null, 2));
        }
        
        const salah = playersData.find(p => p.player_name.includes('Salah'));
        if (salah) {
            console.log("\n👤 Salah Raw Data (Base URL):");
            console.log(JSON.stringify(salah, null, 2));
        }
    }
  } catch (error) {
    console.error("❌ Error fetching/parsing:", error);
  }
}

main();
