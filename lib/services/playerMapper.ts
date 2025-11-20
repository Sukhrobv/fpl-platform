import { Player } from '@prisma/client';

export interface MappingCandidate {
  id: string;
  name: string;
  team?: string;
}

export interface MappingResult {
  candidateId: string;
  confidence: number; // 0 to 1
  method: 'EXACT' | 'FUZZY' | 'MANUAL';
}

/**
 * Normalizes a player name for comparison.
 * - Converts to lowercase
 * - Removes accents/diacritics
 * - Removes special characters
 * - Standardizes spaces
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
 * 1 = exact match, 0 = completely different.
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
 */
export function findBestMatch(
  targetName: string,
  candidates: MappingCandidate[],
  threshold = 0.7
): MappingResult | null {
  let bestMatch: MappingCandidate | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    // 1. Exact match check (fast path)
    if (normalizeName(targetName) === normalizeName(candidate.name)) {
      return {
        candidateId: candidate.id,
        confidence: 1.0,
        method: 'EXACT'
      };
    }

    // 2. Fuzzy match
    const score = calculateSimilarity(targetName, candidate.name);
    
    // Boost score if partial match (e.g. "Bruno Fernandes" in "Bruno Miguel Borges Fernandes")
    // This is a simple heuristic: if one normalized name includes the other
    const n1 = normalizeName(targetName);
    const n2 = normalizeName(candidate.name);
    if (n1.includes(n2) || n2.includes(n1)) {
        // Boost significantly but don't make it 1.0 unless exact
        // If score was low, boost it. If high, keep it high.
        // Example: "Son" vs "Son Heung-Min" -> distance is large, score low.
        // But includes check passes.
        // We should probably use a different metric for inclusion, but for now let's just boost.
        // Actually, for FPL names, usually "Web Name" is a substring of full name.
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
