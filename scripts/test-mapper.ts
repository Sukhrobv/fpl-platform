
import { findBestMatch, MappingCandidate } from "../lib/services/playerMapper";

const candidates: MappingCandidate[] = [
  { id: "241", name: "Robert Lynch Sánchez", webName: "Sánchez" },
  { id: "541", name: "Bruno Guimarães Rodriguez Moura", webName: "Bruno G." },
  { id: "1", name: "Erling Haaland", webName: "Haaland" }
];

const targets = [
  "Robert Sanchez",
  "Bruno Guimaraes",
  "Haaland"
];

console.log("Testing Mapper...");

for (const target of targets) {
  const match = findBestMatch(target, candidates);
  console.log(`Target: "${target}" -> Match: ${match ? `${match.candidateId} (${match.confidence.toFixed(2)})` : "None"}`);
}
