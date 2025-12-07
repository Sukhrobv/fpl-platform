import { Player } from '@prisma/client';

export interface MappingCandidate {
  id: string;
  name: string;
  webName?: string;
  team?: string;
}

export interface MappingResult {
  candidateId: string;
  confidence: number; // 0 to 1
  method: 'EXACT' | 'FUZZY' | 'MANUAL';
}

/**
 * MANUAL MAPPINGS DICTIONARY
 * Key: FPL Web Name
 * Value: Understat Name
 */
const MANUAL_MAPPINGS: Record<string, string> = {
  // --- ARSENAL ---
  "G.Jesus": "Gabriel Jesus",
  "Fábio Vieira": "Fábio Vieira",
  "Raya": "David Raya",
  "Zinchenko": "Oleksandr Zinchenko",
  "Tomiyasu": "Takehiro Tomiyasu",
  "Timber": "Jurrien Timber",
  "Martinelli": "Gabriel Martinelli",
  "Gabriel": "Gabriel Magalhães",
  
  // --- ASTON VILLA ---
  "Dibu Martinez": "Emiliano Martínez",
  "Moreno": "Álex Moreno",
  "Diego Carlos": "Diego Carlos",
  "Konsa": "Ezri Konsa",
  "Buendia": "Emiliano Buendía",
  "Duran": "Jhon Durán",
  "Rogers": "Morgan Rogers",
  "Philogene": "Jaden Philogene-Bidace",
  "Onana": "Amadou Onana", // Villa midfielder

  // --- BOURNEMOUTH ---
  "Neto": "Norberto Murara Neto", // GK
  "Kepa": "Kepa", 
  "Ouattara": "Dango Ouattara",
  "Kluivert": "Justin Kluivert",
  "Semenyo": "Antoine Semenyo",
  "Kerkez": "Milos Kerkez",
  "Sinisterra": "Luis Sinisterra",
  "J.Araujo": "Julian Araujo", 
  "Evanilson": "Evanilson",

  // --- BRENTFORD ---
  "I.Toney": "Ivan Toney",
  "Mbeumo": "Bryan Mbeumo",
  "Wissa": "Yoane Wissa",
  "Damsgaard": "Mikkel Damsgaard",
  "Norgaard": "Christian Nørgaard",
  "Jensen": "Mathias Jensen",
  "Janelt": "Vitaly Janelt",
  "Pinnock": "Ethan Pinnock",
  "Mee": "Ben Mee",
  "Flekken": "Mark Flekken",
  "Ajer": "Kristoffer Ajer",
  "Collins": "Nathan Collins",
  "Roerslev": "Mads Roerslev",
  "Zanka": "Mathias Jørgensen",
  "Ghoddos": "Saman Ghoddos",
  "Onyeka": "Frank Onyeka",
  "Schade": "Kevin Schade",
  "Carvalho": "Fabio Carvalho",
  "Sepp": "Sepp van den Berg",

  // --- BRIGHTON ---
  "Mitoma": "Kaoru Mitoma",
  "Estupiñan": "Pervis Estupiñán",
  "Joao Pedro": "João Pedro",
  "Igor": "Igor Julio",
  "Enciso": "Julio Enciso",
  "Van Hecke": "Jan Paul van Hecke",
  "Veltman": "Joël Veltman",
  "March": "Solly March",
  "Ferguson": "Evan Ferguson",
  "Verbruggen": "Bart Verbruggen",
  "Steele": "Jason Steele",
  "Dunk": "Lewis Dunk",
  "Minteh": "Yankuba Minteh",
  "Wieffer": "Mats Wieffer",
  "Gruda": "Brajan Gruda",
  "Rutter": "Georginio Rutter",

  // --- CHELSEA ---
  "N.Jackson": "Nicolas Jackson",
  "Caicedo": "Moisés Caicedo",
  "Enzo": "Enzo Fernández",
  "Disasi": "Axel Disasi",
  "Sanchez": "Robert Sánchez",
  "R.Sánchez": "Robert Sánchez",
  "Petrovic": "Djordje Petrovic",
  "Cucurella": "Marc Cucurella",
  "Badiashile": "Benoît Badiashile",
  "Chalobah": "Trevoh Chalobah",
  "Chilwell": "Ben Chilwell",
  "James": "Reece James",
  "Gusto": "Malo Gusto",
  "Colwill": "Levi Colwill",
  "Fofana": "Wesley Fofana",
  "Mudryk": "Mykhailo Mudryk",
  "Madueke": "Noni Madueke",
  "Palmer": "Cole Palmer",
  "Lavia": "Romeo Lavia",
  "Nkunku": "Christopher Nkunku",
  "Jorgensen": "Filip Jörgensen",
  "Pedro Neto": "Pedro Neto", // Winger
  "Felix": "João Félix",
  "Guiu": "Marc Guiu",
  "Ugochukwu": "Lesley Ugochukwu",

  // --- CRYSTAL PALACE ---
  "Eze": "Eberechi Eze",
  "Mateta": "Jean-Philippe Mateta",
  "Edouard": "Odsonne Édouard",
  "Schlupp": "Jeffrey Schlupp",
  "Hughes": "Will Hughes",
  "Lerma": "Jefferson Lerma",
  "Doucouré": "Cheick Doucouré",
  "Wharton": "Adam Wharton",
  "Ahamada": "Naouirou Ahamada",
  "Munoz": "Daniel Muñoz",
  "Henderson": "Dean Henderson",
  "Guehi": "Marc Guéhi",
  "Richards": "Chris Richards",
  "Mitchell": "Tyrick Mitchell",
  "Kamada": "Daichi Kamada",
  "Sarr": "Ismaïla Sarr",
  "Nketiah": "Eddie Nketiah",
  "Lacroix": "Maxence Lacroix",

  // --- EVERTON ---
  "Pickford": "Jordan Pickford",
  "Virginia": "João Virgínia",
  "Tarkowski": "James Tarkowski",
  "Branthwaite": "Jarrad Branthwaite",
  "Mykolenko": "Vitalii Mykolenko",
  "Young": "Ashley Young",
  "Patterson": "Nathan Patterson",
  "Coleman": "Seamus Coleman",
  "Keane": "Michael Keane",
  "McNeil": "Dwight McNeil",
  "Harrison": "Jack Harrison",
  "Garner": "James Garner",
  "Gueye": "Idrissa Gueye",
  "Doucoure": "Abdoulaye Doucouré",
  "DCL": "Dominic Calvert-Lewin",
  "Calvert-Lewin": "Dominic Calvert-Lewin",
  "Beto": "Beto",
  "Chermiti": "Youssef Chermiti",
  "Ndiaye": "Iliman Ndiaye",
  "Lindstrom": "Jesper Lindstrøm",
  "O'Brien": "Jake O'Brien",
  "Iroegbunam": "Tim Iroegbunam",

  // --- FULHAM ---
  "Leno": "Bernd Leno",
  "Robinson": "Antonee Robinson",
  "Castagne": "Timothy Castagne",
  "Bassey": "Calvin Bassey",
  "Diop": "Issa Diop",
  "Iwobi": "Alex Iwobi",
  "Andreas": "Andreas Pereira",
  "Pereira": "Andreas Pereira",
  "Wilson": "Harry Wilson",
  "Cairney": "Tom Cairney",
  "Lukic": "Sasa Lukic",
  "Traore": "Adama Traoré", // Adama
  "Muniz": "Rodrigo Muniz",
  "Jimenez": "Raúl Jiménez",
  "Smith Rowe": "Emile Smith Rowe",
  "Andersen": "Joachim Andersen",
  "Berge": "Sander Berge",
  "Cuenca": "Jorge Cuenca",

  // --- IPSWICH ---
  "Muric": "Arijanet Muric",
  "Szmodics": "Sammie Szmodics",
  "Delap": "Liam Delap",
  "O'Shea": "Dara O'Shea",
  "Phillips": "Kalvin Phillips",
  "Cajuste": "Jens Cajuste",
  "Clarke": "Jack Clarke",

  // --- LEICESTER ---
  "Vardy": "Jamie Vardy",
  "Winks": "Harry Winks",
  "Ndidi": "Wilfred Ndidi",
  "Fatawu": "Abdul Fatawu",
  "Mavididi": "Stephy Mavididi",
  "Kristiansen": "Victor Kristiansen",
  "Faes": "Wout Faes",
  "Hermansen": "Mads Hermansen",
  "Okoli": "Caleb Okoli",
  "Skipp": "Oliver Skipp",
  "Ayew": "Jordan Ayew",
  "Buonanotte": "Facundo Buonanotte",

  // --- LIVERPOOL ---
  "Alisson": "Alisson",
  "Kelleher": "Caoimhin Kelleher",
  "Van Dijk": "Virgil van Dijk",
  "Konate": "Ibrahima Konaté",
  "Gomez": "Joe Gomez",
  "Quansah": "Jarell Quansah",
  "Robertson": "Andrew Robertson",
  "Tsimikas": "Konstantinos Tsimikas",
  "Bradley": "Conor Bradley",
  "Alexander-Arnold": "Trent Alexander-Arnold",
  "Mac Allister": "Alexis Mac Allister",
  "Szoboszlai": "Dominik Szoboszlai",
  "Jones": "Curtis Jones",
  "Elliott": "Harvey Elliott",
  "Gravenberch": "Ryan Gravenberch",
  "Endo": "Wataru Endo",
  "Salah": "Mohamed Salah",
  "Jota": "Diogo Jota",
  "Gakpo": "Cody Gakpo",
  "Diaz": "Luis Díaz",
  "Luis Díaz": "Luis Díaz",
  "Darwin": "Darwin Núñez",
  "Nunez": "Darwin Núñez",
  "Chiesa": "Federico Chiesa",

  // --- MAN CITY ---
  "Haaland": "Erling Haaland",
  "Foden": "Phil Foden",
  "Doku": "Jérémy Doku",
  "Grealish": "Jack Grealish",
  "Bobb": "Oscar Bobb",
  "De Bruyne": "Kevin De Bruyne",
  "Rodri": "Rodri",
  "Kovacic": "Mateo Kovacic",
  "Nunes": "Matheus Nunes",
  "Lewis": "Rico Lewis",
  "Walker": "Kyle Walker",
  "Stones": "John Stones",
  "Dias": "Rúben Dias",
  "Rúben": "Rúben Dias",
  "Ake": "Nathan Aké",
  "Gvardiol": "Josko Gvardiol",
  "Akanji": "Manuel Akanji",
  "Ederson M.": "Ederson",
  "Ederson": "Ederson",
  "Ortega": "Stefan Ortega",
  "Savinho": "Savio",
  "Gundogan": "Ilkay Gündogan",

  // --- MAN UTD ---
  "Rashford": "Marcus Rashford",
  "Hojlund": "Rasmus Højlund",
  "Garnacho": "Alejandro Garnacho",
  "Fernandes": "Bruno Fernandes",
  "B.Fernandes": "Bruno Fernandes",
  "Mainoo": "Kobbie Mainoo",
  "Casemiro": "Casemiro",
  "Eriksen": "Christian Eriksen",
  "Dalot": "Diogo Dalot",
  "Maguire": "Harry Maguire",
  "Martinez": "Lisandro Martínez",
  "Lindelof": "Victor Lindelöf",
  "Evans": "Jonny Evans",
  "Shaw": "Luke Shaw",
  "André Onana": "André Onana", // GK
  "Bayindir": "Altay Bayindir",
  "Zirkzee": "Joshua Zirkzee",
  "De Ligt": "Matthijs de Ligt",
  "Mazraoui": "Noussair Mazraoui",
  "Ugarte": "Manuel Ugarte",
  "Yoro": "Leny Yoro",
  "Amad": "Amad Diallo",

  // --- NEWCASTLE ---
  "Gordon": "Anthony Gordon",
  "Isak": "Alexander Isak",
  "Barnes": "Harvey Barnes",
  "Almiron": "Miguel Almirón",
  "Murphy": "Jacob Murphy",
  "Bruno G.": "Bruno Guimarães",
  "Longstaff": "Sean Longstaff",
  "Joelinton": "Joelinton",
  "Miley": "Lewis Miley",
  "Willock": "Joe Willock",
  "Tonali": "Sandro Tonali",
  "Trippier": "Kieran Trippier",
  "Livramento": "Tino Livramento",
  "Schar": "Fabian Schär",
  "Botman": "Sven Botman",
  "Burn": "Dan Burn",
  "Hall": "Lewis Hall",
  "Dubravka": "Martin Dubravka",
  "Pope": "Nick Pope",
  "Kelly": "Lloyd Kelly",
  "Osula": "William Osula",

  // --- NOTTINGHAM FOREST ---
  "Elanga": "Anthony Elanga",
  "Gibbs-White": "Morgan Gibbs-White",
  "Hudson-Odoi": "Callum Hudson-Odoi",
  "Wood": "Chris Wood",
  "Awoniyi": "Taiwo Awoniyi",
  "Dominguez": "Nicolás Domínguez",
  "Danilo": "Danilo",
  "Yates": "Ryan Yates",
  "Sangare": "Ibrahim Sangaré",
  "Aina": "Ola Aina",
  "Williams": "Neco Williams",
  "Murillo": "Murillo",
  "Boly": "Willy Boly",
  "Sels": "Matz Sels",
  "Anderson": "Elliot Anderson",
  "Milenkovic": "Nikola Milenkovic",
  "Jota Silva": "Jota Silva",
  "Ward-Prowse": "James Ward-Prowse",

  // --- SOUTHAMPTON ---
  "Ramsdale": "Aaron Ramsdale",
  "McCarthy": "Alex McCarthy",
  "Stephens": "Jack Stephens",
  "Bednarek": "Jan Bednarek",
  "Harwood-Bellis": "Taylor Harwood-Bellis",
  "Walker-Peters": "Kyle Walker-Peters",
  "Sugawara": "Yukinari Sugawara",
  "Downes": "Flynn Downes",
  "Smallbone": "William Smallbone",
  "Aribo": "Joe Aribo",
  "Armstrong": "Adam Armstrong",
  "Brereton Diaz": "Ben Brereton",
  "Archer": "Cameron Archer",
  "Dibling": "Tyler Dibling",
  "Mateus Fernandes": "Mateus Fernandes",

  // --- SPURS ---
  "Son": "Son Heung-Min",
  "Richarlison": "Richarlison",
  "Johnson": "Brennan Johnson",
  "Werner": "Timo Werner",
  "James Maddison": "James Maddison",
  "Pape Matar Sarr": "Pape Matar Sarr",
  "Yves Bissouma": "Yves Bissouma",
  "Rodrigo Bentancur": "Rodrigo Bentancur",
  "Dejan Kulusevski": "Dejan Kulusevski",
  "Destiny Udogie": "Destiny Udogie",
  "Pedro Porro": "Pedro Porro",
  "Romero": "Cristian Romero",
  "Van de Ven": "Micky van de Ven",
  "Dragusin": "Radu Dragusin",
  "Davies": "Ben Davies",
  "Vicario": "Guglielmo Vicario",
  "Solanke": "Dominic Solanke",
  "Gray": "Archie Gray",
  "Odobert": "Wilson Odobert",
  "Bergvall": "Lucas Bergvall",

  // --- WEST HAM ---
  "Bowen": "Jarrod Bowen",
  "Kudus": "Mohammed Kudus",
  "Antonio": "Michail Antonio",
  "Paqueta": "Lucas Paquetá",
  "L.Paquetá": "Lucas Paquetá",
  "Soucek": "Tomás Soucek",
  "Alvarez": "Edson Álvarez",
  "Coufal": "Vladimír Coufal",
  "Emerson": "Emerson",
  "Mavropanos": "Konstantinos Mavropanos",
  "Areola": "Alphonse Areola",
  "Fabianski": "Lukasz Fabianski",
  "Fullkrug": "Niclas Füllkrug",
  "Summerville": "Crysencio Summerville",
  "Kilman": "Max Kilman",
  "Wan-Bissaka": "Aaron Wan-Bissaka",
  "Todibo": "Jean-Clair Todibo",
  "Rodriguez": "Guido Rodríguez",
  "Soler": "Carlos Soler",

  // --- WOLVES ---
  "Cunha": "Matheus Cunha",
  "Hwang": "Hwang Hee-chan",
  "Hee Chan": "Hwang Hee-chan",
  "Sarabia": "Pablo Sarabia",
  "Lemina": "Mario Lemina",
  "Gomes": "João Gomes",
  "J.Gomes": "João Gomes",
  "Doyle": "Tommy Doyle",
  "Bellegarde": "Jean-Ricner Bellegarde",
  "Semedo": "Nélson Semedo",
  "Ait-Nouri": "Rayan Aït-Nouri",
  "Dawson": "Craig Dawson",
  "Toti": "Toti Gomes",
  "Sa": "José Sá",
  "Larsen": "Jørgen Strand Larsen",
  "R.Gomes": "Rodrigo Gomes",
  "Andre": "André",
  "Johnstone": "Sam Johnstone",
  "B.Traore": "Boubacar Traoré"
};

/**
 * Normalizes a player name for comparison.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ø/g, "o")      // Handle norwegian o
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, "")     // Remove special chars
    .trim()
    .replace(/\s+/g, " ");           // Single spaces
}

/**
 * Calculates Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculates similarity score between 0 and 1.
 */
export function calculateSimilarity(s1: string, s2: string): number {
  const norm1 = normalizeName(s1);
  const norm2 = normalizeName(s2);

  if (norm1 === norm2) return 1.0;

  const maxLength = Math.max(norm1.length, norm2.length);
  if (maxLength === 0) return 1.0;

  const distance = levenshteinDistance(norm1, norm2);
  return 1 - distance / maxLength;
}

/**
 * Finds the best match for a player name from a list of candidates.
 * targetName = Understat Name
 * candidates = FPL Players
 */
export function findBestMatch(
  targetName: string,
  candidates: MappingCandidate[],
  threshold = 0.7
): MappingResult | null {
  
  // 1. MANUAL DICTIONARY CHECK (REVERSE LOOKUP)
  // We need to find an FPL candidate whose WebName maps to the current Understat targetName
  const manualCandidate = candidates.find(candidate => {
    // Look up the candidate's WebName in our dictionary
    const mappedUnderstatName = MANUAL_MAPPINGS[candidate.webName || ""];
    
    // If a mapping exists, check if it matches the current target (Understat name)
    if (mappedUnderstatName) {
      return normalizeName(mappedUnderstatName) === normalizeName(targetName);
    }
    return false;
  });

  if (manualCandidate) {
    return {
      candidateId: manualCandidate.id,
      confidence: 1.0,
      method: 'MANUAL'
    };
  }

  // 2. STANDARD MATCHING LOGIC
  let bestMatch: MappingCandidate | null = null;
  let bestScore = 0;

  const nTarget = normalizeName(targetName);

  for (const candidate of candidates) {
    // Exact match check
    const nCandidate = normalizeName(candidate.name);
    if (nTarget === nCandidate) {
      return {
        candidateId: candidate.id,
        confidence: 1.0,
        method: 'EXACT'
      };
    }

    // Fuzzy match against Full Name
    let score = calculateSimilarity(targetName, candidate.name);
    
    // Boost score if partial match
    const tokens1 = nTarget.split(' ');
    const tokens2 = nCandidate.split(' ');
    
    const allTokens1In2 = tokens1.every(t => tokens2.includes(t));
    const allTokens2In1 = tokens2.every(t => tokens1.includes(t));

    if (allTokens1In2 || allTokens2In1) {
        score = Math.min(0.95, score + 0.25);
    } else if (nTarget.includes(nCandidate) || nCandidate.includes(nTarget)) {
        score = Math.min(0.95, score + 0.25);
    }

    // Fuzzy match against Web Name (if available)
    if (candidate.webName) {
        const nWeb = normalizeName(candidate.webName);
        let webScore = calculateSimilarity(targetName, candidate.webName);
        
        if (nTarget.includes(nWeb) || nWeb.includes(nTarget)) {
             webScore = Math.min(0.95, webScore + 0.2);
        }
        
        if (webScore > score) {
            score = webScore;
        }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  if (bestMatch && bestScore >= threshold) {
    return {
      candidateId: bestMatch.id,
      confidence: bestScore,
      method: 'FUZZY'
    };
  }

  return null;
}