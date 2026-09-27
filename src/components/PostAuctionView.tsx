import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Trophy, FileDown, Home, CheckCircle2, BarChart3, Users, ThumbsUp, AlertTriangle, BadgeIndianRupee, ClipboardList, Globe, Info } from 'lucide-react';
import { AuctionRoomState, Player, PlayingXIDraft, UnitScore } from '../types';
import { PLAYERS_BY_ID } from '../data/players';
import { formatPrice, formatRole } from '../utils/format';
import { buildBestXIDraft, generateTeamAnalysis } from '../services/bestXIEngine';
import { getPlayerRating } from '../services/playerRatings';
import { generateAuctionPDFReport } from '../services/pdfReportGenerator';
import { clearCelebration } from '../utils/celebrate';
import { Button, CountUp, EmptyState, Notice, Panel, PanelHeader, PlayerPhoto, Price, RatingRing, StatMeter, TabBar, TeamTag, ratingColor } from './ui';
import { XIBuilder } from './XIBuilder';
import { TeamSheet } from './results/TeamSheet';
import { AwardsPanel } from './results/Awards';

interface PostAuctionViewProps {
  roomState: AuctionRoomState;
  participantId: string | null;
  onReturnHome?: () => void;
  onSubmitPlayingXI?: (draft: PlayingXIDraft) => void;
  lastError?: string | null;
  lastNotice?: string | null;
}

type Tab = 'my-xi' | 'sheets' | 'ratings' | 'compare' | 'awards';

const EASE = [0.16, 1, 0.3, 1] as const;

// Small rating chip used in lists; the number is always shown, colour only reinforces it.
function RatingChip({ value }: { value: number }) {
  return (
    <span
      className="inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border font-display text-lg font-extrabold tabular"
      style={{ borderColor: ratingColor(value), color: ratingColor(value) }}
      title={`Player rating ${value}`}
    >
      {value}
    </span>
  );
}

function HeadlineStat({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-widest text-ink-3">{label}</dt>
      <dd className="truncate font-display text-2xl font-extrabold tabular text-ink sm:text-3xl">{children}</dd>
      {note && <dd className="truncate text-xs text-ink-3">{note}</dd>}
    </div>
  );
}

export const PostAuctionView: React.FC<PostAuctionViewProps> = ({ roomState, participantId, onReturnHome, onSubmitPlayingXI, lastError, lastNotice }) => {
  // Results are for reading: sweep away confetti left over from the last sale.
  useEffect(() => clearCelebration(), []);
  const { teams, participants } = roomState;
  const playingXIs = roomState.playingXIs ?? {};
  const teamList = useMemo(() => Object.values(teams), [teams]);
  const myTeamId = participantId ? participants[participantId]?.teamId : null;
  const myTeam = myTeamId ? teams[myTeamId] : undefined;
  const completed = roomState.status === 'COMPLETED';

  const [selectedTeamId, setSelectedTeamId] = useState<string>(myTeamId || teamList[0]?.id || '');
  const [chosenTab, setTab] = useState<Tab>(myTeam ? 'my-xi' : 'sheets');
  const tab: Tab = chosenTab === 'my-xi' && !myTeam ? 'sheets' : chosenTab;
  const [pdfState, setPdfState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');

  const activeTeam = teams[selectedTeamId] || teamList[0];
  const analyses = useMemo(
    () => Object.fromEntries(teamList.map((t) => [t.id, generateTeamAnalysis(t)])) as Record<string, ReturnType<typeof generateTeamAnalysis>>,
    [teamList],
  );
  const analysis = activeTeam ? analyses[activeTeam.id] : null;
  const suggestions = useMemo(() => Object.fromEntries(teamList.map((t) => [t.id, buildBestXIDraft(t)])) as Record<string, PlayingXIDraft>, [teamList]);

  const squad = useMemo(
    () =>
      activeTeam
        ? (activeTeam.playersBought.map((p) => PLAYERS_BY_ID[p.playerId]).filter(Boolean) as Player[]).sort(
            (a, b) => getPlayerRating(b).overall - getPlayerRating(a).overall,
          )
        : [],
    [activeTeam],
  );
  const priceOf = (playerId: string) => activeTeam?.playersBought.find((p) => p.playerId === playerId)?.soldPrice ?? 0;

  const totalSold = Object.keys(roomState.soldPlayers).length;
  const totalSpent = teamList.reduce((sum, t) => sum + (t.startingPurse - t.remainingPurse), 0);
  const recordBuy = Object.values(roomState.soldPlayers).sort((a, b) => b.soldPrice - a.soldPrice)[0];
  const submittedCount = teamList.filter((t) => playingXIs[t.id]).length;

  // Best value: strongest players bought at or below the auction's median price.
  const bestBuys = useMemo(() => {
    const sales = teamList
      .flatMap((t) => t.playersBought.map((b) => ({ b, team: t, player: PLAYERS_BY_ID[b.playerId] })))
      .filter((x) => !!x.player);
    if (sales.length === 0) return [];
    const prices = sales.map((x) => x.b.soldPrice).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    return sales
      .filter((x) => x.b.soldPrice <= median)
      .map((x) => ({ ...x, rating: getPlayerRating(x.player).overall }))
      .sort((a, b) => b.rating - a.rating || a.b.soldPrice - b.b.soldPrice)
      .slice(0, 5);
  }, [teamList]);

  const downloadPdf = () => {
    setPdfState('working');
    try {
      const pdf = generateAuctionPDFReport(roomState);
      pdf.save(`IPL_AUCTION_${roomState.name.replace(/[^a-zA-Z0-9]/g, '_')}_REPORT.pdf`);
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 4000);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      setPdfState('error');
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    ...(myTeam ? [{ key: 'my-xi' as Tab, label: 'My XI' }] : []),
    { key: 'sheets', label: `Team sheets (${submittedCount}/${teamList.length})` },
    { key: 'ratings', label: 'Team ratings' },
    { key: 'compare', label: 'Compare' },
    { key: 'awards', label: 'Awards' },
  ];

  const unitCards: [string, UnitScore][] = analysis
    ? [
        ['Batting', analysis.battingScore],
        ['Top order', analysis.topOrderScore],
        ['Hitting power', analysis.finishingScore],
        ['Bowling', analysis.bowlingScore],
        ['Run control', analysis.economyScore],
        ['Wicket-taking', analysis.wicketTakingScore],
        ['All-rounders', analysis.allRoundersScore],
        ['Wicket-keeping', analysis.wicketkeepingScore],
        ['Experience', analysis.experienceScore],
        ['Bench depth', analysis.benchStrengthScore],
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <Panel className="relative overflow-hidden p-5 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 stripe-ipl" aria-hidden />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-widest text-ipl-orange">
              <Trophy className="h-5 w-5" aria-hidden /> {completed ? 'Auction complete' : 'Results so far'}
            </p>
            <h1 className="mt-1 break-words font-display text-4xl font-extrabold uppercase italic leading-none tracking-tight text-ink sm:text-5xl">{roomState.name}</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={pdfState === 'done' ? 'success' : 'primary'}
              icon={pdfState === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <FileDown className="h-4 w-4" />}
              loading={pdfState === 'working'}
              onClick={downloadPdf}
            >
              {pdfState === 'done' ? 'Report downloaded' : 'Download PDF report'}
            </Button>
            {onReturnHome && (
              <Button variant="ghost" icon={<Home className="h-4 w-4" />} onClick={onReturnHome}>
                Home
              </Button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          <HeadlineStat label="Players sold">
            <CountUp value={totalSold} />
          </HeadlineStat>
          <HeadlineStat label="Total spent">
            <CountUp value={totalSpent} format={(n) => formatPrice(Math.round(n * 100) / 100)} />
          </HeadlineStat>
          <HeadlineStat label="Record buy" note={recordBuy?.playerName}>{recordBuy ? <span className="text-ipl-gold">{formatPrice(recordBuy.soldPrice)}</span> : '-'}</HeadlineStat>
          <HeadlineStat label="XIs submitted">
            {submittedCount}/{teamList.length}
          </HeadlineStat>
        </dl>

        {pdfState === 'error' && (
          <Notice tone="error" className="mt-4">
            Couldn't build the PDF from this auction's data. Try again.
          </Notice>
        )}

        {teamList.length > 0 && (
          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
            <TabBar label="Results views" value={tab} onChange={setTab} tabs={tabs} />
            {tab === 'ratings' && (
              <div className="flex flex-wrap gap-1.5" aria-label="Choose team">
                {teamList.map((team) => (
                  <button
                    key={team.id}
                    aria-pressed={team.id === activeTeam?.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`rounded-full transition-all ${team.id === activeTeam?.id ? 'ring-2 ring-ipl-orange' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <TeamTag shortName={team.shortName} color={team.color} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* No initial={false} here: AnimatePresence hands it down to every descendant of the
          first tab, which silently disabled all enter animations inside My XI. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${tab}-${tab === 'ratings' ? activeTeam?.id : ''}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          {teamList.length === 0 ? (
            <Panel>
              <EmptyState icon={<Users className="h-8 w-8" />} title="No teams took part">
                This auction ended before any team registered.
              </EmptyState>
            </Panel>
          ) : tab === 'my-xi' && myTeam ? (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-3xl font-extrabold uppercase italic tracking-tight text-ink">Pick your Playing XI</h2>
                <p className="mt-1 max-w-3xl text-ink-2">
                  We've started you on the strongest legal XI for {myTeam.name}. Change anything, set your batting order, captain, vice-captain and keeper, name
                  your impact subs, then submit. Every rule is checked as you go.
                </p>
              </div>
              {!completed && (
                <Notice>
                  <span className="inline-flex items-center gap-1.5">
                    <Info className="h-4 w-4" aria-hidden /> You can draft now; submitting opens when the auctioneer ends the auction.
                  </span>
                </Notice>
              )}
              <XIBuilder
                roomId={roomState.id}
                team={myTeam}
                submitted={playingXIs[myTeam.id]}
                onSubmit={completed ? onSubmitPlayingXI : undefined}
                lastError={lastError}
                lastNotice={lastNotice}
              />
            </div>
          ) : tab === 'sheets' ? (
            <div className="space-y-4">
              <p className="text-ink-2">
                {submittedCount === teamList.length
                  ? 'Every team has submitted its Playing XI.'
                  : `${submittedCount} of ${teamList.length} teams have submitted. Teams still picking show their suggested XI.`}
              </p>
              {/* auto-fit collapses unused tracks, so two teams share the row instead of leaving a gap. */}
              <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                {teamList.map((team, i) => {
                  const sub = playingXIs[team.id];
                  return (
                    <motion.li key={team.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.06, type: 'spring', stiffness: 260, damping: 28 }}>
                      <TeamSheet team={team} sheet={sub ?? suggestions[team.id]} status={sub ? 'submitted' : 'suggested'} submittedAt={sub?.submittedAt} highlight={team.id === myTeamId} />
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          ) : tab === 'ratings' && activeTeam && analysis ? (
            <div className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <Panel className="flex h-full flex-col items-center justify-center gap-4 border-ipl-orange/40 p-6 text-center">
                  <RatingRing value={analysis.overallScore} size={168} label="Overall" />
                  <div>
                    <p className="font-display text-2xl font-bold uppercase tracking-wide text-ink">{activeTeam.name}</p>
                    <p className="mt-1 text-sm text-ink-2">35% batting, 35% bowling, then bench, all-round cover, keeping and experience.</p>
                  </div>
                </Panel>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.35, ease: EASE }}>
                <Panel className="grid h-full gap-6 p-6 sm:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-live">
                      <ThumbsUp className="h-5 w-5" aria-hidden /> Strengths
                    </p>
                    {analysis.strengths.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-3">No unit rates 80 or above yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-ink-2">
                        {analysis.strengths.map((s) => (
                          <li key={s} className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-live" aria-hidden />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-ipl-gold">
                      <AlertTriangle className="h-5 w-5" aria-hidden /> Watch-outs
                    </p>
                    {analysis.weaknesses.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-3">No gaps flagged.</p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-ink-2">
                        {analysis.weaknesses.map((s) => (
                          <li key={s} className="flex gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ipl-gold" aria-hidden />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 sm:col-span-2">{analysis.dataSourceNotes}</p>
                </Panel>
                </motion.div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {unitCards.map(([title, unit], i) => (
                  <motion.div key={title} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.35, ease: EASE }}>
                    <Panel className="h-full p-4">
                      <StatMeter label={title} value={unit.score} delay={0.1 + i * 0.04} />
                      <p className="mt-3 text-xs leading-relaxed text-ink-3">{unit.description}</p>
                      {Object.entries(unit.metrics).map(([k, v]) => (
                        <p key={k} className="mt-2 text-xs text-ink-2">
                          {k}: <span className="font-semibold tabular text-ink">{v}</span>
                        </p>
                      ))}
                      {unit.keyPlayers.length > 0 && <p className="mt-1 truncate text-xs text-ink-3">{unit.keyPlayers.slice(0, 3).join(', ')}</p>}
                    </Panel>
                  </motion.div>
                ))}
              </div>

              <Panel>
                <PanelHeader icon={<ClipboardList className="h-5 w-5" />} title={`Squad (${squad.length})`} action={<Price value={activeTeam.remainingPurse} className="text-lg" />} />
                {squad.length === 0 ? (
                  <EmptyState title="No players bought">This team didn't win any bids.</EmptyState>
                ) : (
                  <ul className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                    {squad.map((player, i) => (
                      <motion.li
                        key={player.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i, 14) * 0.025 }}
                        className="flex items-center gap-3 rounded-xl border border-line bg-night/40 p-2.5"
                      >
                        <PlayerPhoto player={player} className="h-12 w-10 shrink-0 rounded-lg bg-pitch-2" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate font-semibold text-ink">
                            <span className="truncate">{player.name}</span>
                            {player.isOverseas && <Globe className="h-3.5 w-3.5 shrink-0 text-ipl-blue-bright" aria-label="Overseas" />}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {formatRole(player.role)} · <Price value={priceOf(player.id)} className="text-xs" />
                          </span>
                        </span>
                        <RatingChip value={getPlayerRating(player).overall} />
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          ) : tab === 'compare' ? (
            <div className="space-y-6">
              <Panel>
                <PanelHeader icon={<BarChart3 className="h-5 w-5" />} title="All teams" />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-ink-3">
                        {['#', 'Team', 'Overall', 'Batting', 'Bowling', 'Top order', 'Hitting', 'Run control', 'Bench', 'Spent', 'Purse left'].map((h) => (
                          <th key={h} scope="col" className="px-4 py-3 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {[...teamList]
                        .sort((a, b) => (analyses[b.id]?.overallScore ?? 0) - (analyses[a.id]?.overallScore ?? 0))
                        .map((team, rank) => {
                          const rep = analyses[team.id];
                          if (!rep) return null;
                          return (
                            <motion.tr
                              key={team.id}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: rank * 0.05 }}
                              className={`tabular text-ink-2 hover:bg-pitch-2/60 ${team.id === myTeamId ? 'bg-ipl-orange/5' : ''}`}
                            >
                              <td className="px-4 py-3 font-display text-lg font-bold text-ink-3">{rank + 1}</td>
                              <th scope="row" className="px-4 py-3 font-semibold text-ink">
                                <span className="flex items-center gap-2">
                                  <TeamTag shortName={team.shortName} color={team.color} /> {team.name}
                                </span>
                              </th>
                              <td className="px-4 py-3 font-display text-xl font-bold" style={{ color: ratingColor(rep.overallScore) }}>
                                {rep.overallScore}
                              </td>
                              <td className="px-4 py-3">{rep.battingScore.score}</td>
                              <td className="px-4 py-3">{rep.bowlingScore.score}</td>
                              <td className="px-4 py-3">{rep.topOrderScore.score}</td>
                              <td className="px-4 py-3">{rep.finishingScore.score}</td>
                              <td className="px-4 py-3">{rep.economyScore.score}</td>
                              <td className="px-4 py-3">{rep.benchStrengthScore.score}</td>
                              <td className="px-4 py-3">
                                <Price value={team.startingPurse - team.remainingPurse} />
                              </td>
                              <td className="px-4 py-3">{formatPrice(team.remainingPurse)}</td>
                            </motion.tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel>
                <PanelHeader icon={<BadgeIndianRupee className="h-5 w-5" />} title="Best value buys" />
                <div className="p-5">
                  <p className="text-sm text-ink-2">The highest-rated players bought at or below this auction's median price.</p>
                  {bestBuys.length === 0 ? (
                    <EmptyState title="No sales yet" />
                  ) : (
                    <ul className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
                      {bestBuys.map(({ b, team, player, rating }, i) => (
                        <motion.li
                          key={b.playerId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex items-center gap-3 rounded-xl border border-line bg-night/50 p-3"
                        >
                          <PlayerPhoto player={player} className="h-14 w-11 shrink-0 rounded-lg bg-pitch-2" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink">{player.name}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                              <TeamTag shortName={team.shortName} color={team.color} className="px-1.5 text-xs" />
                              <Price value={b.soldPrice} className="text-sm" />
                            </p>
                          </div>
                          <RatingChip value={rating} />
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          ) : (
            <AwardsPanel roomState={roomState} analyses={analyses} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
