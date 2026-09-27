import { Player, PlayingXIDraft } from '../types';

/*
  Playing XI rules, shared by the server (authoritative check on SUBMIT_PLAYING_XI)
  and the XI builder (live checklist). Errors block submission; warnings are advice.

  Based on IPL playing conditions:
   - 11 players, at most 4 overseas in the XI
   - a designated wicket-keeper, captain and vice-captain
   - 20 overs at 4 per bowler means at least 5 bowling options
   - Impact Player: up to 5 named substitutes from the bench. If the XI already has
     4 overseas players, an overseas substitute cannot come on.
*/

export const XI_SIZE = 11;
export const MAX_OVERSEAS_IN_XI = 4;
export const MIN_BOWLING_OPTIONS = 5;
export const MIN_BATTING_OPTIONS = 6;
export const MAX_IMPACT_SUBS = 5;

export interface XIRuleResult {
  id: string;
  label: string; // short checklist label, e.g. "Max 4 overseas"
  ok: boolean;
  detail: string; // current state in plain words, e.g. "3 of 4 used"
  severity: 'error' | 'warning';
}

const isBowlingOption = (p: Player) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER';
const isBattingOption = (p: Player) => p.role !== 'BOWLER';

// `squad` is the team's bought players; `lookup` resolves ids (e.g. PLAYERS_BY_ID).
export function checkPlayingXI(draft: PlayingXIDraft, squad: Player[], lookup: Record<string, Player>): XIRuleResult[] {
  const squadIds = new Set(squad.map((p) => p.id));
  const xiIds = [...new Set(draft.playerIds)];
  const xi = xiIds.map((id) => lookup[id]).filter(Boolean) as Player[];
  const overseas = xi.filter((p) => p.isOverseas).length;
  const keepers = xi.filter((p) => p.role === 'WICKET_KEEPER');
  const bowling = xi.filter(isBowlingOption).length;
  const batting = xi.filter(isBattingOption).length;
  const specialistBowlers = xi.filter((p) => p.role === 'BOWLER').length;
  const inXI = (id: string) => !!id && xiIds.includes(id);
  const keeper = lookup[draft.wicketKeeperId];
  const orderOk =
    draft.battingOrder.length === xiIds.length &&
    draft.battingOrder.every((id) => xiIds.includes(id)) &&
    new Set(draft.battingOrder).size === draft.battingOrder.length;
  const subs = [...new Set(draft.impactSubIds)];
  const subsValid = subs.every((id) => squadIds.has(id) && !xiIds.includes(id));
  const overseasSubsBlocked = overseas >= MAX_OVERSEAS_IN_XI && subs.some((id) => lookup[id]?.isOverseas);
  const topThree = draft.battingOrder.slice(0, 3).map((id) => lookup[id]).filter(Boolean) as Player[];
  const allOwn = xiIds.every((id) => squadIds.has(id));

  return [
    {
      id: 'size',
      label: `Exactly ${XI_SIZE} players`,
      ok: xiIds.length === XI_SIZE && xiIds.length === draft.playerIds.length,
      detail: `${xiIds.length} of ${XI_SIZE} picked`,
      severity: 'error',
    },
    {
      id: 'own-squad',
      label: 'Only players from your squad',
      ok: allOwn,
      detail: allOwn ? 'All from your squad' : 'Some players are not in your squad',
      severity: 'error',
    },
    {
      id: 'overseas',
      label: `Max ${MAX_OVERSEAS_IN_XI} overseas`,
      ok: overseas <= MAX_OVERSEAS_IN_XI,
      detail: `${overseas} of ${MAX_OVERSEAS_IN_XI} used`,
      severity: 'error',
    },
    {
      id: 'keeper',
      label: 'A wicket-keeper who keeps',
      ok: keepers.length >= 1 && inXI(draft.wicketKeeperId) && keeper?.role === 'WICKET_KEEPER',
      detail:
        keepers.length === 0
          ? 'No wicket-keeper in the XI'
          : !inXI(draft.wicketKeeperId) || keeper?.role !== 'WICKET_KEEPER'
            ? 'Choose who keeps wicket'
            : `${keeper.name} keeps`,
      severity: 'error',
    },
    {
      id: 'bowling',
      label: `At least ${MIN_BOWLING_OPTIONS} bowling options`,
      ok: bowling >= MIN_BOWLING_OPTIONS,
      detail: `${bowling} bowlers and all-rounders (20 overs, max 4 each)`,
      severity: 'error',
    },
    {
      id: 'captain',
      label: 'Captain and vice-captain',
      ok: inXI(draft.captainId) && inXI(draft.viceCaptainId) && draft.captainId !== draft.viceCaptainId,
      detail: !inXI(draft.captainId)
        ? 'Pick a captain from the XI'
        : !inXI(draft.viceCaptainId)
          ? 'Pick a vice-captain from the XI'
          : draft.captainId === draft.viceCaptainId
            ? 'Captain and vice-captain must be different'
            : `${lookup[draft.captainId]?.shortName} (C), ${lookup[draft.viceCaptainId]?.shortName} (VC)`,
      severity: 'error',
    },
    {
      id: 'order',
      label: 'Batting order set',
      ok: orderOk,
      detail: orderOk ? 'All 11 placed' : 'Every XI player needs a batting position',
      severity: 'error',
    },
    {
      id: 'impact',
      label: `Up to ${MAX_IMPACT_SUBS} impact substitutes`,
      ok: subs.length <= MAX_IMPACT_SUBS && subsValid && !overseasSubsBlocked,
      detail: !subsValid
        ? 'Substitutes must be bench players from your squad'
        : overseasSubsBlocked
          ? 'XI already has 4 overseas, so an overseas sub could never come on'
          : `${subs.length} of ${MAX_IMPACT_SUBS} named`,
      severity: 'error',
    },
    {
      id: 'batting-depth',
      label: `${MIN_BATTING_OPTIONS}+ batting options`,
      ok: batting >= MIN_BATTING_OPTIONS,
      detail: `${batting} batters, keepers and all-rounders`,
      severity: 'warning',
    },
    {
      id: 'specialist-bowlers',
      label: '3+ specialist bowlers',
      ok: specialistBowlers >= 3,
      detail: `${specialistBowlers} specialist bowlers`,
      severity: 'warning',
    },
    {
      id: 'top-order',
      label: 'No bowler in the top 3',
      ok: topThree.every((p) => p.role !== 'BOWLER'),
      detail: topThree.some((p) => p.role === 'BOWLER') ? 'A specialist bowler bats in the top 3' : 'Top order is batters',
      severity: 'warning',
    },
  ];
}

export function playingXIErrors(draft: PlayingXIDraft, squad: Player[], lookup: Record<string, Player>): string[] {
  return checkPlayingXI(draft, squad, lookup)
    .filter((r) => r.severity === 'error' && !r.ok)
    .map((r) => `${r.label}: ${r.detail}`);
}
