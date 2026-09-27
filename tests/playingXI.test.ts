import assert from 'assert';
import { ALL_PLAYERS, PLAYERS_BY_ID } from '../src/data/players';
import { buildBestXIDraft } from '../src/services/bestXIEngine';
import { checkPlayingXI, playingXIErrors } from '../src/services/playingXIRules';
import { Player, PlayingXIDraft, Team } from '../src/types';

console.log('Running Playing XI rule tests...\n');

const pick = (filter: (p: Player) => boolean, n: number, exclude: Set<string> = new Set()) => {
  const out = ALL_PLAYERS.filter((p) => filter(p) && !exclude.has(p.id)).slice(0, n);
  assert.strictEqual(out.length, n, `Test data: could not find ${n} players for a filter`);
  out.forEach((p) => exclude.add(p.id));
  return out;
};

// A realistic 18-player squad: 6 batters (2 overseas), 2 keepers, 4 all-rounders (1 overseas), 6 bowlers (2 overseas).
const used = new Set<string>();
const squad: Player[] = [
  ...pick((p) => p.role === 'BATSMAN' && !p.isOverseas, 4, used),
  ...pick((p) => p.role === 'BATSMAN' && p.isOverseas, 2, used),
  ...pick((p) => p.role === 'WICKET_KEEPER' && !p.isOverseas, 1, used),
  ...pick((p) => p.role === 'WICKET_KEEPER' && p.isOverseas, 1, used),
  ...pick((p) => p.role === 'ALL_ROUNDER' && !p.isOverseas, 3, used),
  ...pick((p) => p.role === 'ALL_ROUNDER' && p.isOverseas, 1, used),
  ...pick((p) => p.role === 'BOWLER' && !p.isOverseas, 4, used),
  ...pick((p) => p.role === 'BOWLER' && p.isOverseas, 2, used),
];
const team: Team = {
  id: 'team-test',
  name: 'Test XI',
  shortName: 'TST',
  ownerParticipantId: 'owner',
  startingPurse: 120,
  remainingPurse: 20,
  squadSize: squad.length,
  overseasCount: squad.filter((p) => p.isOverseas).length,
  playersBought: squad.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    playerRole: p.role,
    isOverseas: p.isOverseas,
    basePrice: p.basePrice,
    soldPrice: p.basePrice,
    soldAt: new Date().toISOString(),
    bidCount: 1,
  })),
};

// 1. The engine's draft is fully legal.
const best = buildBestXIDraft(team);
const bestErrors = playingXIErrors(best, squad, PLAYERS_BY_ID);
assert.deepStrictEqual(bestErrors, [], `Best XI draft must satisfy every rule, got: ${bestErrors.join('; ')}`);
assert.strictEqual(best.playerIds.length, 11);
assert(best.impactSubIds.length > 0 && best.impactSubIds.length <= 5, 'Best draft names impact subs');
console.log(`✓ 1. buildBestXIDraft: legal XI, C/VC/WK set, ${best.impactSubIds.length} impact subs.`);

// 2. A hand-built valid XI passes with no errors.
const valid: PlayingXIDraft = { ...best, battingOrder: [...best.battingOrder] };
assert.deepStrictEqual(playingXIErrors(valid, squad, PLAYERS_BY_ID), []);
console.log('✓ 2. Valid XI passes.');

const failsOn = (draft: PlayingXIDraft, ruleId: string, message: string) => {
  const rule = checkPlayingXI(draft, squad, PLAYERS_BY_ID).find((r) => r.id === ruleId)!;
  assert(rule && !rule.ok && rule.severity === 'error', message);
};

// 3. Five overseas players fail.
{
  const overseas = squad.filter((p) => p.isOverseas).map((p) => p.id);
  assert(overseas.length >= 5, 'Test data needs 5 overseas');
  const domestic = best.playerIds.filter((id) => !PLAYERS_BY_ID[id].isOverseas);
  const ids = [...overseas.slice(0, 5), ...domestic.slice(0, 6)];
  failsOn({ ...best, playerIds: ids, battingOrder: ids, impactSubIds: [] }, 'overseas', '5 overseas must fail');
  console.log('✓ 3. Five overseas players rejected.');
}

// 4. No keeper in the XI fails.
{
  const nonKeepers = squad.filter((p) => p.role !== 'WICKET_KEEPER').map((p) => p.id);
  const ids = [...squad.filter((p) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER').map((p) => p.id).slice(0, 6), ...nonKeepers.filter((id) => PLAYERS_BY_ID[id].role === 'BATSMAN').slice(0, 5)];
  failsOn({ ...best, playerIds: ids, battingOrder: ids, wicketKeeperId: '', impactSubIds: [] }, 'keeper', 'No keeper must fail');
  console.log('✓ 4. XI without a wicket-keeper rejected.');
}

// 5. Designating a non-keeper as wicket-keeper fails.
{
  const nonKeeper = best.playerIds.find((id) => PLAYERS_BY_ID[id].role !== 'WICKET_KEEPER')!;
  failsOn({ ...best, wicketKeeperId: nonKeeper }, 'keeper', 'WK given to a non-keeper must fail');
  console.log('✓ 5. Keeping gloves given to a non-keeper rejected.');
}

// 6. Fewer than five bowling options fails.
{
  const bats = squad.filter((p) => p.role === 'BATSMAN' || p.role === 'WICKET_KEEPER').map((p) => p.id); // 8
  const bowl = squad.filter((p) => p.role === 'BOWLER').map((p) => p.id).slice(0, 3);
  const ids = [...bats, ...bowl];
  failsOn({ ...best, playerIds: ids, battingOrder: ids, impactSubIds: [] }, 'bowling', '<5 bowling options must fail');
  console.log('✓ 6. Fewer than five bowling options rejected.');
}

// 7. Captain and vice-captain must differ.
failsOn({ ...best, viceCaptainId: best.captainId }, 'captain', 'C == VC must fail');
console.log('✓ 7. Same player as captain and vice-captain rejected.');

// 8. With 4 overseas in the XI, an overseas impact sub fails.
{
  const overseas = squad.filter((p) => p.isOverseas).map((p) => p.id);
  const domestic = squad.filter((p) => !p.isOverseas);
  const keeper = domestic.find((p) => p.role === 'WICKET_KEEPER')!;
  const domBowl = domestic.filter((p) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER').map((p) => p.id);
  const domBat = domestic.filter((p) => p.role === 'BATSMAN').map((p) => p.id);
  const xiOverseas = overseas.slice(0, 4);
  const ids = [...xiOverseas, keeper.id, ...domBowl.slice(0, 4), ...domBat.slice(0, 2)];
  assert.strictEqual(ids.length, 11);
  const sub = overseas.find((id) => !ids.includes(id))!;
  const draft: PlayingXIDraft = { playerIds: ids, battingOrder: ids, captainId: ids[0], viceCaptainId: ids[1], wicketKeeperId: keeper.id, impactSubIds: [sub] };
  failsOn(draft, 'impact', 'Overseas impact sub with 4 overseas in XI must fail');
  console.log('✓ 8. Overseas impact sub blocked when the XI already has 4 overseas.');
}

// 9. Batting order must cover exactly the XI.
failsOn({ ...best, battingOrder: best.battingOrder.slice(0, 10) }, 'order', 'Incomplete batting order must fail');
console.log('✓ 9. Incomplete batting order rejected.');

console.log('\nAll Playing XI rule tests PASSED.');
