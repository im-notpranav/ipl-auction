import React from 'react';
import { motion } from 'motion/react';
import { Info } from 'lucide-react';
import { Player } from '../types';
import { getPlayerRating, topShare } from '../services/playerRatings';
import { RatingRing, StatMeter } from './ui';

/*
  One player's numbers, shared by the projector stage, the phone and the database.
  Meters show sample-adjusted ratings (see playerRatings.ts); the grid shows the
  plain career figures so nothing on screen is hidden behind a model.
*/

interface Stat {
  label: string;
  value: string | number;
}

function careerStats(p: Player): Stat[] {
  const b = p.batting;
  const w = p.bowling;
  const bowlSr = w.wickets > 0 ? (6 * w.average) / w.economy : 0;
  const bat: Stat[] = [
    { label: 'Runs', value: b.runs.toLocaleString('en-IN') },
    { label: 'Average', value: b.runs > 0 ? b.average.toFixed(1) : '-' },
    { label: 'Strike rate', value: b.runs > 0 ? b.strikeRate.toFixed(1) : '-' },
    { label: '50s / 100s', value: `${b.fifties} / ${b.hundreds}` },
  ];
  const bowl: Stat[] = [
    { label: 'Wickets', value: w.wickets },
    { label: 'Economy', value: w.wickets > 0 ? w.economy.toFixed(2) : '-' },
    { label: 'Average', value: w.wickets > 0 ? w.average.toFixed(1) : '-' },
    { label: 'Balls / wkt', value: bowlSr > 0 ? bowlSr.toFixed(1) : '-' },
  ];
  const matches: Stat = { label: 'Matches', value: b.matches };
  if (p.role === 'BOWLER') return [matches, ...bowl];
  if (p.role === 'ALL_ROUNDER') return [matches, bat[0], bat[2], bowl[0], bowl[1]];
  if (p.role === 'WICKET_KEEPER') return [matches, ...bat.slice(0, 3), { label: 'Dismissals', value: p.fielding.catches + p.fielding.stumpings }];
  return [matches, ...bat];
}

export function PlayerStats({ player, variant = 'stage' }: { player: Player; variant?: 'stage' | 'compact' }) {
  const r = getPlayerRating(player);
  const stage = variant === 'stage';
  const meters: { label: string; value: number; note?: string }[] = [];
  if (player.role !== 'BOWLER') meters.push({ label: 'Batting', value: r.batting.rating, note: r.batting.ballsFaced > 0 ? topShare(r.batting.percentile) : undefined });
  if (player.role === 'BOWLER' || player.role === 'ALL_ROUNDER')
    meters.push({ label: 'Bowling', value: r.bowling.rating, note: r.bowling.ballsBowled > 0 ? topShare(r.bowling.percentile) : undefined });
  if (r.keeping !== null) meters.push({ label: 'Keeping', value: r.keeping });
  meters.push({ label: 'Experience', value: r.experience, note: `${player.batting.matches} matches` });

  const stats = careerStats(player);

  return (
    <div className={stage ? 'space-y-5' : 'space-y-4'}>
      <div className="flex items-center gap-5">
        <RatingRing value={r.overall} size={stage ? 104 : 76} />
        <div className="min-w-0 flex-1 space-y-2.5">
          {meters.map((m, i) => (
            <StatMeter key={m.label} label={m.label} value={m.value} note={m.note} delay={0.1 + i * 0.08} />
          ))}
        </div>
      </div>

      <dl className={`grid gap-y-3 ${stage ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-3'}`}>
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="border-l border-line pl-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.05, duration: 0.35 }}
          >
            <dt className="text-xs text-ink-3 sm:text-sm">{s.label}</dt>
            <dd className={`font-display font-bold tabular text-ink ${stage ? 'text-3xl' : 'text-2xl'}`}>{s.value}</dd>
          </motion.div>
        ))}
      </dl>

      {(r.tags.length > 0 || r.confidence !== 'HIGH') && (
        <div className="flex flex-wrap items-center gap-2">
          {r.tags.map((t) => (
            <span key={t} className="rounded-full border border-line-strong bg-pitch-2 px-2.5 py-0.5 text-xs font-semibold text-ink-2">
              {t}
            </span>
          ))}
          {r.confidence !== 'HIGH' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {r.sampleNote}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
