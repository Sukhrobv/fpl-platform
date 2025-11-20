import axios from 'axios';

async function testUnderstat() {
  const url = 'https://understat.com/league/EPL/2024';
  console.log(`Fetching ${url}...`);

  try {
    const response = await axios.get(url);
    const html = response.data;

    // Regex to find playersData
    // The data is usually inside: var playersData = JSON.parse('...');
    const playersRegex = /var\s+playersData\s*=\s*JSON\.parse\('([^']+)'\)/;
    const match = html.match(playersRegex);

    if (!match) {
      console.error('Could not find playersData in HTML');
      return;
    }

    const encodedJson = match[1];
    
    // Understat uses hex encoding in the string, e.g. \x7B for {
    // JSON.parse in JS handles standard escapes, but we might need to decode the hex manually 
    // if it's raw string content. However, usually JSON.parse('...') in the browser handles it.
    // In Node, we have the raw string literal from the regex.
    // We need to interpret the escapes.
    
    // Function to decode hex escapes like \x7B
    const decodedJson = encodedJson.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    const players = JSON.parse(decodedJson);

    console.log(`Successfully parsed ${players.length} players.`);
    console.log('First player sample:', players[0]);

    // Also check for teamsData
    const teamsRegex = /var\s+teamsData\s*=\s*JSON\.parse\('([^']+)'\)/;
    const teamsMatch = html.match(teamsRegex);
    if (teamsMatch) {
        const encodedTeams = teamsMatch[1];
        const decodedTeams = encodedTeams.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        const teams = JSON.parse(decodedTeams);
        console.log(`Successfully parsed teams data.`);
        console.log('First team sample keys:', Object.keys(teams).slice(0, 5));
    }

  } catch (error) {
    console.error('Error fetching Understat:', error);
  }
}

testUnderstat();
