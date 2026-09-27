import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { BadgeIndianRupee, Crown, Flame, Gem, Scale, Tag, Wallet } from 'lucide-react';
import { AuctionRoomState, Player, PlayerRole, SoldPlayerRecord, Team, TeamAnalysisReport } from '../../types';
import { PLAYERS_BY_ID } from '../../data/players';
import { getPlayerRating } from '../../services/playerRatings';
import { formatPrice, formatRole } from '../../utils/format';
import { EmptyState, Panel, PanelHeader, PlayerPhoto, TeamTag, ratingColor } from '../ui';

/*
  Auction awards (the talking points after the hammer) and each squad's make-up.
  Every award is computed from the sale records, so it is reproducible.
*/

interface Sale {
  b: SoldPlayerRecord;
  team: Team;
  player: Player;
  rating: number;
}

interface Award {
  key: string;
  title: string;
  icon: React.ReactNode;
  headline: string;
  detail: string;
  player?: Player;
  team?: Team;
}

const ROLE_ORDER: PlayerRole[] = ['BATSMAN', 'WICKET_KEEPER', 'ALL_ROUNDER', 'BOWLER'];
const ROLE_COLOR: Record<PlayerRole, string> = {
  BATSMAN: 'var(--color-ipl-orange)',
  WICKET_KEEPER: 'var(--color-ipl-gold)',
  ALL_ROUNDER: 'var(--color-ipl-blue-bright)',
  BOWLER: 'var(--color-ink-2)',
};
const ROLE_LABEL: Record<PlayerRole, string> = { BATSMAN: 'Batters', WICKET_KEEPER: 'Keepers', ALL_ROUNDER: 'All-rounders', BOWLER: 'Bowlers' };

export function computeAwards(roomState: AuctionRoomState, analyses: Record<string, TeamAnalysisReport>): Award[] {
  const teams = Object.values(roomState.teams);
  const sales: Sale[] = teams.flatMap((team) =>
    team.playersBought
      .map((b) => ({ b, team, player: PLAYERS_BY_ID[b.playerId] }))
      .filter((x): x is Omit<Sale, 'rating'> => !!x.player)
      .map((x) => ({ ...x, rating: getPlayerRating(x.player).overall })),
  );
  if (sales.length === 0) return [];

  const awards: Award[] = [];
  const top = <T,>(xs: T[], score: (x: T) => number) => [...xs].sort((a, b) => score(b) - score(a))[0];

  const priciest = top(sales, (s) => s.b.soldPrice);
  awards.push({
    key: 'priciest',
    title: 'Most expensive buy',
    icon: <Crown className="h-5 w-5" />,
    headline: priciest.player.name,
    detail: `${formatPrice(priciest.b.soldPrice)} to ${priciest.team.shortName}`,
    player: priciest.player,
    team: priciest.team,
  });

  const prices = sales.map((s) => s.b.soldPrice).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const value = top(
    sales.filter((s) => s.b.soldPrice <= median),
    (s) => s.rating * 100 - s.b.soldPrice,
  );
  if (value) {
    awards.push({
      key: 'value',
      title: 'Best value buy',
      icon: <Gem className="h-5 w-5" />,
      headline: value.player.name,
      detail: `Rated ${value.rating} for ${formatPrice(value.b.soldPrice)} (${value.team.shortName})`,
      player: value.player,
      team: value.team,
    });
  }

  const atBase = sales.filter((s) => s.b.soldPrice <= s.b.basePrice + 1e-9);
  const bargain = top(atBase.length ? atBase : sales, (s) => s.rating * 100 - s.b.soldPrice / s.b.basePrice);
  if (bargain && bargain.b.playerId !== value?.b.playerId) {
    awards.push({
      key: 'bargain',
      title: 'Bargain of the auction',
      icon: <Tag className="h-5 w-5" />,
      headline: bargain.player.name,
      detail:
        bargain.b.soldPrice <= bargain.b.basePrice + 1e-9
          ? `Went at base price ${formatPrice(bargain.b.soldPrice)} (rated ${bargain.rating})`
          : `${formatPrice(bargain.b.soldPrice)} for a ${bargain.rating}-rated player`,
      player: bargain.player,
      team: bargain.team,
    });
  }

  const war = top(sales, (s) => s.b.bidCount);
  if (war && war.b.bidCount > 1) {
    awards.push({
      key: 'war',
      title: 'Biggest bidding war',
      icon: <Flame className="h-5 w-5" />,
      headline: war.player.name,
      detail: `${war.b.bidCount} bids, from ${formatPrice(war.b.basePrice)} to ${formatPrice(war.b.soldPrice)}`,
      player: war.player,
      team: war.team,
    });
  }

  const spent = (t: Team) => t.startingPurse - t.remainingPurse;
  const spender = top(teams, spent);
  if (spender && spent(spender) > 0) {
    awards.push({
      key: 'spender',
      title: 'Biggest spender',
      icon: <Wallet className="h-5 w-5" />,
      headline: spender.name,
      detail: `${formatPrice(spent(spender))} on ${spender.squadSize} ${spender.squadSize === 1 ? 'player' : 'players'}`,
      team: spender,
    });
  }

  const strongest = top(teams.filter((t) => analyses[t.id]), (t) => analyses[t.id].overallScore);
  if (strongest) {
    awards.push({
      key: 'strongest',
      title: 'Strongest squad',
      icon: <Scale className="h-5 w-5" />,
      headline: strongest.name,
      detail: `Team rating ${analyses[strongest.id].overallScore}, the best balance of batting, bowling and depth`,
      team: strongest,
    });
  }

  return awards;
}

function AwardCard({ award, index }: { award: Award; index: number }) {
  const color = award.team?.color || '#4f78e6';
  return (
    <motion.li
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 260, damping: 24 }}
      className="relative flex overflow-hidden rounded-2xl border border-line bg-pitch/90"
    >
      <div className="absolute inset-0 opacity-60" style={{ background: `radial-gradient(90% 120% at 100% 0%, ${color}33, transparent 60%)` }} aria-hidden />
      <div className="relative flex min-w-0 flex-1 flex-col p-4">
        <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-ipl-gold">
          {award.icon}
          {award.title}
        </p>
        <p className="mt-2 font-display text-2xl font-extrabold uppercase italic leading-tight text-ink">{award.headline}</p>
        <p className="mt-1 text-sm text-ink-2">{award.detail}</p>
        {award.team && (
          <div className="mt-auto pt-3">
            <TeamTag shortName={award.team.shortName} color={award.team.color} />
          </div>
        )}
      </div>
      {award.player && (
        <div className="relative w-24 shrink-0 self-end sm:w-28">
          <PlayerPhoto player={award.player} className="aspect-[4/5] w-full object-contain object-bottom" />
        </div>
      )}
    </motion.li>
  );
}

function SquadMakeup({ team, index }: { team: Team; index: number }) {
  const players = team.playersBought.map((b) => ({ b, p: PLAYERS_BY_ID[b.playerId] })).filter((x) => x.p);
  const total = players.length || 1;
  const spentTotal = players.reduce((s, x) => s + x.b.soldPrice, 0) || 1;
  const byRole = ROLE_ORDER.map((role) => {
    const xs = players.filter((x) => x.p.role === role);
    return { role, count: xs.length, spend: xs.reduce((s, x) => s + x.b.soldPrice, 0) };
  });

  const bar = (key: 'count' | 'spend', denom: number, label: string) => (
    <div>
      <p className="mb-1 text-xs text-ink-3">{label}</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-pitch-3" role="img" aria-label={`${team.name} ${label}: ${byRole.map((r) => `${ROLE_LABEL[r.role]} ${key === 'count' ? r.count : formatPrice(r.spend)}`).join(', ')}`}>
        {byRole.map((r) =>
          r[key] > 0 ? (
            <motion.span
              key={r.role}
              className="h-full"
              style={{ backgroundColor: ROLE_COLOR[r.role] }}
              initial={{ width: 0 }}
              whileInView={{ width: `${(r[key] / denom) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          ) : null,
        )}
      </div>
    </div>
  );

  return (
    <motion.li
      className="rounded-xl border border-line bg-night/40 p-4"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between gap-2">
        <TeamTag shortName={team.shortName} color={team.color} />
        <span className="text-xs text-ink-3 tabular">
          {players.length} players · {formatPrice(team.startingPurse - team.remainingPurse)}
        </span>
      </div>
      <div className="mt-3 space-y-2.5">
        {bar('count', total, 'Players by role')}
        {bar('spend', spentTotal, 'Spend by role')}
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
        {byRole.map((r) => (
          <div key={r.role}>
            <dt className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ROLE_COLOR[r.role] }} aria-hidden />
              {ROLE_LABEL[r.role]}
            </dt>
            <dd className="font-display text-lg font-bold tabular text-ink">{r.count}</dd>
            <dd className="text-[11px] tabular text-ink-3">{r.spend > 0 ? formatPrice(r.spend) : '-'}</dd>
          </div>
        ))}
      </dl>
    </motion.li>
  );
}

export function AwardsPanel({ roomState, analyses }: { roomState: AuctionRoomState; analyses: Record<string, TeamAnalysisReport> }) {
  const awards = useMemo(() => computeAwards(roomState, analyses), [roomState, analyses]);
  const teams = Object.values(roomState.teams);

  // Top 5 buys overall by rating, for a quick "who got the stars" glance.
  const stars = useMemo(
    () =>
      teams
        .flatMap((t) => t.playersBought.map((b) => ({ b, t, p: PLAYERS_BY_ID[b.playerId] })))
        .filter((x) => x.p)
        .map((x) => ({ ...x, r: getPlayerRating(x.p).overall }))
        .sort((a, b) => b.r - a.r)
        .slice(0, 5),
    [teams],
  );

  if (awards.length === 0) {
    return (
      <Panel>
        <EmptyState icon={<BadgeIndianRupee className="h-8 w-8" />} title="No sales, no awards">
          Awards appear once players have been sold.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {awards.map((a, i) => (
          <AwardCard key={a.key} award={a} index={i} />
        ))}
      </ul>

      <Panel>
        <PanelHeader title="Highest-rated buys" />
        <ol className="divide-y divide-line">
          {stars.map(({ b, t, p, r }, i) => (
            <motion.li
              key={b.playerId}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-20px' }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 px-5 py-2.5"
            >
              <span className="w-5 font-display text-lg font-bold tabular text-ink-3">{i + 1}</span>
              <PlayerPhoto player={p} className="h-11 w-9 shrink-0 rounded-md bg-pitch-2" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{p.name}</span>
                <span className="block text-xs text-ink-3">
                  {formatRole(p.role)} · {formatPrice(b.soldPrice)}
                </span>
              </span>
              <TeamTag shortName={t.shortName} color={t.color} className="hidden sm:inline-flex" />
              <span className="w-8 text-right font-display text-xl font-extrabold tabular" style={{ color: ratingColor(r) }}>
                {r}
              </span>
            </motion.li>
          ))}
        </ol>
      </Panel>

      <Panel>
        <PanelHeader title="Squad make-up" />
        <ul className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
          {teams.map((t, i) => (
            <SquadMakeup key={t.id} team={t} index={i} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}
