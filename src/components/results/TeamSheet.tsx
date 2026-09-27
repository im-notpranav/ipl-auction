import React from 'react';
import { motion } from 'motion/react';
import { Globe, Repeat } from 'lucide-react';
import { PlayingXIDraft, Team } from '../../types';
import { PLAYERS_BY_ID } from '../../data/players';
import { getPlayerRating } from '../../services/playerRatings';
import { TeamLogo, ratingColor } from '../ui';

/*
  Printed-style team sheet: batting order 1-11 with captaincy and keeping marks,
  then the named impact substitutes. Used for every team on the results screen,
  so it has to read well on a projector as well as a phone.
*/

const ROLE_SHORT: Record<string, string> = { BATSMAN: 'BAT', WICKET_KEEPER: 'WK', ALL_ROUNDER: 'AR', BOWLER: 'BOWL' };

export function Mark({ children, tone = 'gold', title }: { children: React.ReactNode; tone?: 'gold' | 'blue' | 'ink'; title?: string }) {
  const cls =
    tone === 'gold'
      ? 'bg-ipl-gold text-night'
      : tone === 'blue'
        ? 'bg-ipl-blue-bright/20 text-ipl-blue-bright'
        : 'border border-line-strong text-ink-2';
  return (
    <span title={title} className={`inline-flex h-5 items-center rounded px-1.5 font-display text-xs font-bold leading-none ${cls}`}>
      {children}
    </span>
  );
}

interface TeamSheetProps {
  team: Team;
  sheet: PlayingXIDraft;
  status: 'submitted' | 'suggested';
  submittedAt?: string;
  highlight?: boolean;
}

export function TeamSheet({ team, sheet, status, submittedAt, highlight }: TeamSheetProps) {
  const color = team.color || '#4f78e6';
  const order = sheet.battingOrder.length === sheet.playerIds.length ? sheet.battingOrder : sheet.playerIds;
  const xiRating = order.length
    ? Math.round(order.reduce((sum, id) => sum + (PLAYERS_BY_ID[id] ? getPlayerRating(PLAYERS_BY_ID[id]).overall : 0), 0) / order.length)
    : 0;

  return (
    <article
      className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-pitch/90 ${highlight ? 'border-ipl-orange/60 ring-1 ring-ipl-orange/30' : 'border-line'}`}
      aria-label={`${team.name} ${status === 'submitted' ? 'Playing XI' : 'suggested XI'}`}
    >
      <header className="relative overflow-hidden px-4 py-3" style={{ background: `linear-gradient(110deg, ${color}40, transparent 75%)` }}>
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} aria-hidden />
        <div className="flex items-start justify-between gap-3 pl-1.5">
          <TeamLogo team={team} size={40} className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-extrabold uppercase italic leading-tight tracking-wide text-ink">{team.name}</p>
            <p className="text-xs text-ink-2">
              {status === 'submitted' ? (
                <>
                  Playing XI
                  {submittedAt && <> · submitted {new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                </>
              ) : (
                <span className="text-ipl-gold">Not submitted yet · showing the suggested XI</span>
              )}
            </p>
          </div>
          {order.length > 0 && (
            <div className="shrink-0 text-right">
              <p className="font-display text-2xl font-extrabold leading-none tabular" style={{ color: ratingColor(xiRating) }}>
                {xiRating}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3">XI rating</p>
            </div>
          )}
        </div>
      </header>

      {order.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">No players in this squad.</p>
      ) : (
        <ol className="flex-1 divide-y divide-line/70 px-2 py-1">
          {order.map((id, i) => {
            const p = PLAYERS_BY_ID[id];
            if (!p) return null;
            return (
              <motion.li
                key={id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.025, duration: 0.25 }}
                className="flex items-center gap-2.5 px-2 py-1.5"
              >
                <span className="w-5 shrink-0 text-right font-display text-base font-bold tabular text-ink-3">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {id === sheet.captainId && <Mark title="Captain">C</Mark>}
                  {id === sheet.viceCaptainId && <Mark title="Vice-captain">VC</Mark>}
                  {id === sheet.wicketKeeperId && <Mark title="Wicket-keeper">WK</Mark>}
                  {p.isOverseas && (
                    <span title="Overseas" className="text-ipl-blue-bright">
                      <Globe className="h-3.5 w-3.5" aria-label="Overseas" />
                    </span>
                  )}
                </span>
                <span className="w-9 shrink-0 text-right font-display text-xs font-bold uppercase tracking-wider text-ink-3">{ROLE_SHORT[p.role]}</span>
              </motion.li>
            );
          })}
        </ol>
      )}

      {sheet.impactSubIds.length > 0 && (
        <footer className="border-t border-line px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-ink-3">
            <Repeat className="h-3.5 w-3.5" aria-hidden /> Impact substitutes
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {sheet.impactSubIds
              .map((id) => PLAYERS_BY_ID[id])
              .filter(Boolean)
              .map((p) => p.shortName + (p.isOverseas ? ' (OS)' : ''))
              .join(' · ')}
          </p>
        </footer>
      )}
    </article>
  );
}
