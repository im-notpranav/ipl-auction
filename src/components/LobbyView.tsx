import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Users, Copy, Check, Share2, Play, UserPlus, Tv, Lock, Wallet, Globe, ShieldCheck, Pencil } from 'lucide-react';
import { AuctionRoomState } from '../types';
import { CLASSIC_FRANCHISES, CURRENT_FRANCHISES, Franchise, franchisesFor } from '../data/franchises';
import { Button, EmptyState, Notice, Panel, PanelHeader, TeamLogo, TeamTag, TextField } from './ui';

interface JoinTeamData {
  teamName: string;
  teamShortName: string;
  color: string;
}

interface LobbyViewProps {
  roomState: AuctionRoomState;
  participantId: string | null;
  // Resolves once the team is registered; rejects with a user-facing message.
  onJoinAsTeam: (data: JoinTeamData) => Promise<void>;
  onStartAuction: () => void;
  onKickParticipant: (id: string) => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

function RuleChip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-night/40 px-3 py-1 text-sm text-ink-2">
      <span className="text-ipl-gold">{icon}</span>
      {children}
    </span>
  );
}

export const LobbyView: React.FC<LobbyViewProps> = ({ roomState, participantId, onJoinAsTeam, onStartAuction, onKickParticipant }) => {
  const { name, auctioneerName, teams, participants, settings } = roomState;
  const isAuctioneer = participantId === roomState.auctioneerId;
  const myTeamId = participantId ? participants[participantId]?.teamId : null;
  const myTeam = myTeamId ? teams[myTeamId] : null;
  const teamList = Object.values(teams);
  const maxTeams = settings.maxTeams;
  const roomFull = teamList.length >= maxTeams;
  // 15-team rooms list the classic franchises in their own group under the current ten.
  const franchiseGroups: { label: string; franchises: Franchise[] }[] =
    franchisesFor(maxTeams).length > CURRENT_FRANCHISES.length
      ? [
          { label: 'Current franchises', franchises: CURRENT_FRANCHISES },
          { label: 'Classic franchises', franchises: CLASSIC_FRANCHISES },
        ]
      : [{ label: 'Franchises', franchises: CURRENT_FRANCHISES }];
  const takenShortNames = new Set(teamList.map((t) => t.shortName.toUpperCase()));

  const shareCode = roomState.roomCode || roomState.id;
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${shareCode}` : '';

  const [copied, setCopied] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [teamColor, setTeamColor] = useState(CURRENT_FRANCHISES[1].color);
  const [customTeam, setCustomTeam] = useState(false);
  const [errors, setErrors] = useState<{ teamName?: string; teamShortName?: string; submit?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const share = () => {
    const text = `Join my IPL auction "${name}". Room code ${shareCode}`;
    if (navigator.share) navigator.share({ title: name, text, url: shareUrl }).catch(() => {});
    else window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}: ${shareUrl}`)}`, '_blank', 'noopener');
  };

  const pickFranchise = (f: Franchise) => {
    setTeamName(f.name);
    setTeamShortName(f.short);
    setTeamColor(f.color);
    setCustomTeam(false);
    setErrors((e) => ({ ...e, teamName: undefined, teamShortName: undefined, submit: undefined }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const short = teamShortName.trim().toUpperCase();
    const found: typeof errors = {};
    if (!teamName.trim()) found.teamName = 'Pick a franchise above, or create your own team.';
    if (short.length < 2 || short.length > 4) found.teamShortName = 'Use 2 to 4 letters, like CSK or MI.';
    else if (takenShortNames.has(short)) found.teamShortName = `${short} is already taken in this room.`;
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.teamName || found.teamShortName) setCustomTeam((c) => c || !!teamName);
      return;
    }

    setSubmitting(true);
    try {
      await onJoinAsTeam({ teamName: teamName.trim(), teamShortName: short, color: teamColor });
    } catch (err) {
      setErrors({ submit: err instanceof Error ? err.message : 'Could not register your team. Try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const previewShort = teamShortName.trim().toUpperCase() || '???';

  // ── Right-hand (or top, on phones) panel depends on who is looking ──────
  const actionPanel = isAuctioneer ? (
    <Panel raised className="p-5 sm:p-6">
      <Tv className="h-7 w-7 text-ipl-orange" aria-hidden />
      <h2 className="mt-3 font-display text-2xl font-bold uppercase tracking-wide text-ink">You're the auctioneer</h2>
      <p className="mt-1 text-sm text-ink-2">Put this screen on the projector. Start whenever the room is ready; teams can still join once bidding begins.</p>
      <Button variant="primary" size="lg" fullWidth className="mt-5" icon={<Play className="h-5 w-5" />} onClick={onStartAuction}>
        Start auction
      </Button>
    </Panel>
  ) : myTeam ? (
    <motion.section
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="relative overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lift sm:p-6"
      style={{ background: `linear-gradient(135deg, ${myTeam.color || '#19398a'}40, var(--color-pitch) 55%)` }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: myTeam.color || '#f36f21' }} aria-hidden />
      <motion.div
        className="absolute right-4 top-5 sm:right-6"
        initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
      >
        <TeamLogo team={myTeam} size={96} className="h-20 w-20 sm:h-24 sm:w-24" />
      </motion.div>
      <p className="flex items-center gap-2 text-sm font-semibold text-live">
        <ShieldCheck className="h-4 w-4" aria-hidden /> You're registered
      </p>
      <p className="mt-2 pr-24 font-display text-6xl font-extrabold uppercase italic leading-none text-ink sm:pr-28">{myTeam.shortName}</p>
      <p className="mt-1 pr-24 font-display text-xl font-bold uppercase tracking-wide text-ink-2 sm:pr-28">{myTeam.name}</p>
      <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-night/50 px-3.5 py-3 text-sm text-ink-2" role="status">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ipl-gold opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ipl-gold" />
        </span>
        Waiting for {auctioneerName} to start. Keep this page open; your bid paddle appears here.
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li>
          • Purse <span className="font-semibold text-ipl-gold">₹{myTeam.startingPurse} Cr</span>, up to {settings.maxSquadSize} players and 8 overseas.
        </li>
        <li>• Keep ₹0.20 Cr for every squad slot you still need to fill.</li>
        <li>• Bidding opens when the auctioneer says go. After every bid the paddles lock for a moment.</li>
      </ul>
    </motion.section>
  ) : (
    <Panel raised>
      <PanelHeader icon={<UserPlus className="h-5 w-5" />} title="Register your team" description="Pick a franchise and you're in. You bid from this phone." />
      {roomFull ? (
        <div className="p-5">
          <Notice tone="error">This room already has {maxTeams} teams. Ask the auctioneer to make space.</Notice>
        </div>
      ) : (
        <form onSubmit={handleRegister} noValidate className="flex flex-col gap-6 p-5">
          {errors.submit && <Notice tone="error">{errors.submit}</Notice>}

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-ink">Pick a franchise</span>
            {franchiseGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-2">
            {franchiseGroups.length > 1 && (
              <span className="font-display text-xs font-bold uppercase tracking-[0.2em] text-ink-3">{group.label}</span>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" role="group" aria-label={group.label}>
              {group.franchises.map((f) => {
                const takenBy = teamList.find((t) => t.shortName.toUpperCase() === f.short);
                const selected = !customTeam && teamShortName.toUpperCase() === f.short;
                return (
                  <button
                    key={f.short}
                    type="button"
                    disabled={!!takenBy}
                    aria-pressed={selected}
                    onClick={() => pickFranchise(f)}
                    className={`group relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? 'border-ipl-orange bg-ipl-orange/10' : 'border-line bg-night/60 hover:border-line-strong hover:bg-pitch-2'
                    }`}
                  >
                    <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: f.color }} aria-hidden />
                    <TeamLogo team={{ name: f.name, shortName: f.short, color: f.color }} size={40} className="ml-1 transition-transform duration-200 group-hover:scale-110 group-disabled:grayscale" />
                    <span className="min-w-0">
                      <span className="block font-display text-xl font-extrabold leading-none tracking-wide text-ink">{f.short}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{takenBy ? 'Taken' : f.name}</span>
                    </span>
                    {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-ipl-orange" aria-hidden />}
                  </button>
                );
              })}
            </div>
            </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setCustomTeam(true);
                setTeamName('');
                setTeamShortName('');
              }}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg text-sm font-semibold text-ipl-orange hover:underline"
            >
              <Pencil className="h-4 w-4" aria-hidden /> Or create your own team
            </button>

            <AnimatePresence initial={false}>
              {(customTeam || errors.teamName || errors.teamShortName) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-4 rounded-xl border border-line bg-night/40 p-4">
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                      <TextField label="Team name" maxLength={40} value={teamName} onChange={(e) => setTeamName(e.target.value)} error={errors.teamName} />
                      <TextField
                        label="Short"
                        maxLength={4}
                        autoCapitalize="characters"
                        value={teamShortName}
                        onChange={(e) => setTeamShortName(e.target.value.toUpperCase())}
                        error={errors.teamShortName}
                        className="font-display font-bold tracking-widest"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-semibold text-ink">Team colour</span>
                      <div className="flex flex-wrap gap-2">
                        {franchisesFor(maxTeams).map((f) => (
                          <button
                            key={f.color}
                            type="button"
                            aria-label={`Use the ${f.name} colour`}
                            aria-pressed={teamColor === f.color}
                            onClick={() => setTeamColor(f.color)}
                            className={`h-11 w-11 rounded-full border-2 transition-transform duration-150 sm:h-9 sm:w-9 ${teamColor === f.color ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'}`}
                            style={{ backgroundColor: f.color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-line bg-night/50 p-3" aria-live="polite">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold text-night"
              style={{ backgroundColor: teamColor }}
              aria-hidden
            >
              {previewShort.slice(0, 3)}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-semibold text-ink">{teamName.trim() || 'Your team'}</span>
              <span className="block truncate text-ink-3">₹{settings.startingPurse} Cr purse</span>
            </span>
          </div>

          <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} icon={<UserPlus className="h-5 w-5" />}>
            Register team
          </Button>
        </form>
      )}
    </Panel>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Room header */}
      <section className="stadium relative overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lift sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 stripe-ipl" aria-hidden />
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-gold">Auction lobby</p>
            <h1 className="mt-2 pb-1 font-display text-4xl font-extrabold uppercase italic leading-[0.95] tracking-tight text-ink sm:text-5xl">{name}</h1>
            <p className="mt-2 text-ink-2">
              Run by <span className="font-semibold text-ink">{auctioneerName}</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <RuleChip icon={<Wallet className="h-3.5 w-3.5" />}>₹{settings.startingPurse} Cr purse</RuleChip>
              <RuleChip icon={<Users className="h-3.5 w-3.5" />}>{settings.maxSquadSize}-player squads</RuleChip>
              <RuleChip icon={<Globe className="h-3.5 w-3.5" />}>Max 8 overseas</RuleChip>
              <RuleChip icon={<Lock className="h-3.5 w-3.5" />}>Auctioneer calls every lot</RuleChip>
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-night/50 p-4 md:items-end md:text-right">
            <div>
              <span className="block text-sm text-ink-3">Room code</span>
              <span className="font-display text-4xl font-extrabold tracking-[0.2em] text-ipl-gold select-all sm:text-5xl">{shareCode}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={copied ? <Check className="h-4 w-4 text-live" /> : <Copy className="h-4 w-4" />} onClick={copyLink}>
                {copied ? 'Link copied' : 'Copy invite link'}
              </Button>
              <Button size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share}>
                Share
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* On phones the action (register / waiting) comes first. */}
        <div className="lg:order-2">{actionPanel}</div>

        <Panel className="lg:order-1">
          <PanelHeader
            icon={<Users className="h-5 w-5" />}
            title="Teams in the room"
            action={
              <span className="font-display text-lg font-bold tabular text-ink-2">
                {teamList.length}/{maxTeams}
              </span>
            }
          />
          <div className="px-5 pt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-pitch-3" aria-hidden>
              <motion.div
                className="h-full rounded-full stripe-ipl"
                initial={false}
                animate={{ width: `${(teamList.length / maxTeams) * 100}%` }}
                transition={{ duration: 0.5, ease: EASE }}
              />
            </div>
          </div>
          {teamList.length === 0 ? (
            <EmptyState icon={<Users />} title="No teams yet">
              Share the room code. Teams appear here the moment owners register.
            </EmptyState>
          ) : (
            <ul className="grid gap-2.5 p-5 sm:grid-cols-2 lg:grid-cols-1">
              <AnimatePresence initial={false}>
                {teamList.map((t) => {
                  const owner = participants[t.ownerParticipantId];
                  return (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className={`relative flex items-center gap-3 overflow-hidden rounded-xl border bg-night/60 p-3 pl-4 ${t.id === myTeamId ? 'border-ipl-orange/60' : 'border-line'}`}
                    >
                      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: t.color || '#8390bd' }} aria-hidden />
                      <TeamLogo team={t} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-ink">{t.name}</p>
                        <p className="flex items-center gap-1.5 text-sm text-ink-3">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${owner?.connected ? 'bg-live' : 'bg-ink-3/50'}`} aria-hidden />
                          <span className="truncate">
                            {owner?.connected ? 'Online' : 'Offline'}
                          </span>
                          {t.id === myTeamId && <span className="font-semibold text-ipl-orange">· You</span>}
                        </p>
                      </div>
                      {isAuctioneer ? (
                        <Button size="sm" variant="ghost" onClick={() => onKickParticipant(t.ownerParticipantId)}>
                          Remove
                        </Button>
                      ) : (
                        <TeamTag shortName={t.shortName} name={t.name} color={t.color} />
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
};
