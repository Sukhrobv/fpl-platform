import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api';

describe('Players API', () => {
  it('should fetch players with default pagination', async () => {
    const res = await axios.get(`${BASE_URL}/players`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.success);
    assert.ok(Array.isArray(res.data.data.items));
    assert.strictEqual(res.data.data.items.length, 20); // Default page size
  });

  it('should filter by teamId', async () => {
    // Get a team ID first (e.g. Arsenal)
    const teamsRes = await axios.get(`${BASE_URL}/teams?sortBy=name`);
    const arsenal = teamsRes.data.data.items.find((t: any) => t.name === 'Arsenal');
    
    if (!arsenal) {
        console.warn("Skipping team filter test - Arsenal not found");
        return;
    }

    const res = await axios.get(`${BASE_URL}/players?teamId=${arsenal.id}`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.data.items.length > 0);
    res.data.data.items.forEach((p: any) => {
        // If we use select, teamId might not be in the root object if not selected, 
        // but we selected 'team' relation. 
        // Actually, 'teamId' is not in the selected fields in my optimization!
        // But 'team.name' should be 'Arsenal'.
        assert.strictEqual(p.team.name, 'Arsenal');
    });
  });

  it('should search by name', async () => {
    const res = await axios.get(`${BASE_URL}/players?search=Salah`);
    assert.strictEqual(res.status, 200);
    const salah = res.data.data.items.find((p: any) => p.webName.includes('Salah'));
    assert.ok(salah, 'Should find Salah');
  });

  it('should sort by price descending', async () => {
    const res = await axios.get(`${BASE_URL}/players?sortBy=nowCost&sortDir=desc`);
    assert.strictEqual(res.status, 200);
    const items = res.data.data.items;
    for (let i = 0; i < items.length - 1; i++) {
      assert.ok(items[i].nowCost >= items[i + 1].nowCost, `Item ${i} cost ${items[i].nowCost} should be >= item ${i+1} cost ${items[i+1].nowCost}`);
    }
  });

  it('should return full details when requested', async () => {
    const res = await axios.get(`${BASE_URL}/players?details=true&pageSize=1`);
    const player = res.data.data.items[0];
    // Check for fields that are NOT in the optimized select list
    // e.g. 'goals' or 'assists' are NOT in the select list I defined (wait, I didn't check the schema for what's missing).
    // The select list has: id, fplId, webName, nowCost, totalPoints, position, status, news, chanceOfPlaying, team.
    // 'firstName' is NOT in the select list.
    assert.ok(player.firstName, 'Should have firstName when details=true');
  });

  it('should return optimized fields by default', async () => {
    const res = await axios.get(`${BASE_URL}/players?pageSize=1`);
    const player = res.data.data.items[0];
    // firstName should be undefined/missing if my optimization works and I didn't select it.
    // Note: In JS, accessing missing property is undefined.
    assert.strictEqual(player.firstName, undefined, 'Should NOT have firstName when details=false');
  });
});
