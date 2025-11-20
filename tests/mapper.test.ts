import { normalizeName, calculateSimilarity, findBestMatch } from '../lib/services/playerMapper';
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Player Mapper Service', () => {
  
  describe('normalizeName', () => {
    it('should lowercase and trim', () => {
      assert.strictEqual(normalizeName('  Salah  '), 'salah');
    });

    it('should remove accents', () => {
      assert.strictEqual(normalizeName('Bruno Fernandes'), 'bruno fernandes');
      assert.strictEqual(normalizeName('Ødegaard'), 'odegaard');
      assert.strictEqual(normalizeName('Núñez'), 'nunez');
    });

    it('should remove special chars', () => {
      assert.strictEqual(normalizeName('Son Heung-min'), 'son heungmin');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for exact matches', () => {
      assert.strictEqual(calculateSimilarity('Saka', 'Saka'), 1);
    });

    it('should return high score for close matches', () => {
      const score = calculateSimilarity('Haaland', 'Haland');
      assert.ok(score > 0.8, `Score ${score} should be > 0.8`);
    });

    it('should return low score for different names', () => {
      const score = calculateSimilarity('Salah', 'De Bruyne');
      assert.ok(score < 0.3, `Score ${score} should be < 0.3`);
    });
  });

  describe('findBestMatch', () => {
    const candidates = [
      { id: '1', name: 'Erling Haaland' },
      { id: '2', name: 'Mohamed Salah' },
      { id: '3', name: 'Bruno Fernandes' },
      { id: '4', name: 'Son Heung-Min' }
    ];

    it('should find exact match', () => {
      const result = findBestMatch('Mohamed Salah', candidates);
      assert.strictEqual(result?.candidateId, '2');
      assert.strictEqual(result?.method, 'EXACT');
    });

    it('should find fuzzy match', () => {
      // "Son Heungmin" vs "Son Heung-Min" (normalized: son heungmin vs son heungmin) -> EXACT actually
      // Let's try one that is actually fuzzy
      const result = findBestMatch('Erling Braut Haaland', candidates);
      // Normalized: erling braut haaland vs erling haaland
      // Distance: 6. Length: 20. Score: 1 - 6/20 = 0.7.
      // Threshold is 0.7. So it should match.
      assert.strictEqual(result?.candidateId, '1');
      assert.strictEqual(result?.method, 'FUZZY');
    });
  });
});
