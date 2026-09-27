import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, Reorder, useDragControls } from 'motion/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Globe,
  GripVertical,
  Plus,
  Repeat,
  RotateCcw,
  Send,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { Player, PlayingXIDraft, PlayingXISelection, Team } from '../types';
import { PLAYERS_BY_ID } from '../data/players';
import { buildBestXIDraft, suggestBattingOrder } from '../services/bestXIEngine';
import { getPlayerRating } from '../services/playerRatings';
import { checkPlayingXI, MAX_IMPACT_SUBS, MAX_OVERSEAS_IN_XI, MIN_BOWLING_OPTIONS, XI_SIZE, XIRuleResult } from '../services/playingXIRules';
import { formatRole } from '../utils/format';
import { Button, Notice, Panel, PlayerPhoto, Price, ratingColor } from './ui';
import { Mark } from './results/TeamSheet';

/*
  Build and submit your Playing XI. The draft starts from the strongest legal XI,
  every change is checked live against playingXIRules (the same rules the server
  enforces), and the draft is kept in localStorage so a refresh loses nothing.
*/

interface XIBuilderProps {
  roomId: string;
  team: Team;
  submitted?: PlayingXISelection;
  onSubmit?: (draft: PlayingXIDraft) => void;
  lastError?: string | null;
  lastNotice?: string | null;
}

const EMPTY: PlayingXIDraft = { playerIds: [], captainId: '', viceCaptainId: '', wicketKeeperId: '', battingOrder: [], impactSubIds: [] };

const ROLE_GROUPS: { role: Player['role']; label: string }[] = [
  { role: 'BATSMAN', label: 'Batters' },
  { role: 'WICKET_KEEPER', label: 'Wicket-keepers' },
  { role: 'ALL_ROUNDER', label: 'All-rounders' },
  { role: 'BOWLER', label: 'Bowlers' },
];

const storageKey = (roomId: string, teamId: string) => `ipl_xi_draft_${roomId}_${teamId}`;

function loadDraft(roomId: string, teamId: string): PlayingXIDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(roomId, teamId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Array.isArray(d?.playerIds) || !Array.isArray(d?.battingOrder)) return null;
    return { ...EMPTY, ...d };
  } catch {
    return null;
  }
}

const sameDraft = (a: PlayingXIDraft, b: PlayingXIDraft) =>
  a.captainId === b.captainId &&
  a.viceCaptainId === b.viceCaptainId &&
  a.wicketKeeperId === b.wicketKeeperId &&
  a.battingOrder.join() === b.battingOrder.join() &&
  [...a.playerIds].sort().join() === [...b.playerIds].sort().join() &&
  [...a.impactSubIds].sort().join() === [...b.impactSubIds].sort().join();

function RatingChip({ value, small }: { value: number; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border font-display font-extrabold tabular ${small ? 'h-7 w-9 text-base' : 'h-8 w-10 text-lg'}`}
      style={{ borderColor: ratingColor(value), color: ratingColor(value) }}
      title={`Player rating ${value}`}
    >
      {value}
    </span>
  );
}

function CountBadge({ label, value, max, ok }: { label: string; value: number; max?: number; ok: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${ok ? 'border-live/40 bg-live/5' : 'border-line bg-night/50'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">{label}</p>
      <p className={`font-display text-2xl font-extrabold leading-none tabular ${ok ? 'text-live' : 'text-ink'}`}>
        <motion.span key={value} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block">
          {value}
        </motion.span>
        {max !== undefined && <span className="text-base text-ink-3">/{max}</span>}
      </p>
    </div>
  );
}

// One row of the batting order: drag handle, position, designation toggles, move and remove.
function OrderRow({
  id,
  index,
  total,
  draft,
  onMove,
  onRemove,
  onDesignate,
}: {
  id: string;
  index: number;
  total: number;
  draft: PlayingXIDraft;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onDesignate: (id: string, as: 'C' | 'VC' | 'WK') => void;
}) {
  const controls = useDragControls();
  const p = PLAYERS_BY_ID[id];
  if (!p) return null;
  const rating = getPlayerRating(p).overall;
  const toggle = (as: 'C' | 'VC' | 'WK', active: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label}: ${p.name}`}
      title={label}
      onClick={() => onDesignate(id, as)}
      className={`h-9 min-w-10 touch-manipulation rounded-lg px-1.5 font-display text-sm font-bold transition-[background-color,border-color,color,transform] duration-150 active:scale-95 sm:h-8 sm:min-w-9 ${
        active ? 'bg-ipl-gold text-night shadow-[0_4px_14px_-6px_rgb(242_193_78/0.7)]' : 'border border-line text-ink-3 hover:border-line-strong hover:text-ink'
      }`}
    >
      {as}
    </button>
  );
  const removeButton = (className: string) => (
    <button
      type="button"
      onClick={() => onRemove(id)}
      aria-label={`Drop ${p.name} from the XI`}
      title="Drop from the XI"
      className={`h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-danger/10 hover:text-danger active:scale-90 sm:h-8 sm:w-8 ${className}`}
    >
      <X className="h-4 w-4" />
    </button>
  );
  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => onMove(id, dir)}
      disabled={dir === -1 ? index === 0 : index === total - 1}
      aria-label={`Move ${p.name} ${dir === -1 ? 'up' : 'down'}`}
      className="flex h-9 w-9 touch-manipulation items-center justify-center rounded-lg text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-pitch-3 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-25 sm:h-4 sm:w-6 sm:rounded"
    >
      {dir === -1 ? <ArrowUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <ArrowDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />}
    </button>
  );

  // Phones: two lines (who, then the controls) so names never truncate at 360px.
  // From sm up everything fits on one line.
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
      whileDrag={{ scale: 1.02, boxShadow: '0 16px 40px -12px rgb(0 0 0 / 0.7)', zIndex: 10 }}
      className="relative flex flex-col gap-1 rounded-xl border border-line bg-pitch-2/70 p-2 sm:flex-row sm:items-center sm:gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          className="hidden h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-ink-3 hover:text-ink active:cursor-grabbing sm:flex"
          aria-label={`Drag to reorder ${p.name}`}
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-6 shrink-0 text-right font-display text-lg font-extrabold tabular text-ipl-orange">{index + 1}</span>
        <PlayerPhoto player={p} className="h-10 w-8 shrink-0 rounded-md bg-pitch-3" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-ink">
            <span className="min-w-0 break-words sm:truncate">{p.name}</span>
            {p.isOverseas && <Globe className="h-3.5 w-3.5 shrink-0 text-ipl-blue-bright" aria-label="Overseas" />}
          </p>
          <p className="text-xs text-ink-3">
            {formatRole(p.role)} · <span style={{ color: ratingColor(rating) }}>{rating}</span>
          </p>
        </div>
        {removeButton('flex sm:hidden')}
      </div>
      <div className="flex items-center justify-between gap-1 pl-[4.5rem] sm:justify-end sm:pl-0">
        <div className="flex shrink-0 items-center gap-1">
          {toggle('C', draft.captainId === id, 'Captain')}
          {toggle('VC', draft.viceCaptainId === id, 'Vice-captain')}
          {p.role === 'WICKET_KEEPER' && toggle('WK', draft.wicketKeeperId === id, 'Wicket-keeper')}
        </div>
        <div className="flex shrink-0 items-center sm:flex-col">
          {arrow(-1)}
          {arrow(1)}
        </div>
        {removeButton('hidden sm:flex')}
      </div>
    </Reorder.Item>
  );
}

// One rule in the checklist. When a rule flips to met, the row flashes green once
// and the tick springs in, so fixing something feels acknowledged.
function RuleRow({ rule }: { rule: XIRuleResult }) {
  const prevOk = useRef(rule.ok);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (rule.ok && !prevOk.current) setFlash((n) => n + 1);
    prevOk.current = rule.ok;
  }, [rule.ok]);
  const Icon = rule.ok ? CheckCircle2 : rule.severity === 'error' ? XCircle : AlertTriangle;
  const tone = rule.ok ? 'text-live' : rule.severity === 'error' ? 'text-danger' : 'text-ipl-gold';
  return (
    <li className="relative flex items-start gap-2.5 overflow-hidden rounded-lg px-2 py-1.5">
      {flash > 0 && (
        <motion.span
          key={flash}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg bg-live/15 ring-1 ring-inset ring-live/40"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }}
        />
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${rule.ok}`}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
          className={`relative mt-0.5 shrink-0 ${tone}`}
        >
          <Icon className="h-4 w-4" aria-label={rule.ok ? 'Met' : rule.severity === 'error' ? 'Not met' : 'Advice'} />
        </motion.span>
      </AnimatePresence>
      <span className="relative min-w-0">
        <span className={`block text-sm font-semibold ${rule.ok || rule.severity === 'error' ? 'text-ink' : 'text-ink-2'}`}>
          {rule.label}
          {rule.severity === 'warning' && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-3">Advice</span>}
        </span>
        <span className="block text-xs text-ink-3">{rule.detail}</span>
      </span>
    </li>
  );
}

// "9/11 rules met" with a bar that fills as required rules are satisfied.
function RulesMeter({ met, total, className }: { met: number; total: number; className?: string }) {
  const done = met === total;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">Rules met</p>
        <p className={`font-display text-base font-bold tabular ${done ? 'text-live' : 'text-ink'}`} aria-live="polite">
          <motion.span key={met} initial={{ y: -5, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block">
            {met}
          </motion.span>
          <span className="text-ink-3">/{total}</span>
        </p>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-pitch-3"
        role="progressbar"
        aria-label="Required rules met"
        aria-valuenow={met}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <motion.div
          className={`h-full w-full origin-left rounded-full ${done ? 'bg-live' : 'bg-ipl-orange'}`}
          initial={false}
          animate={{ scaleX: total ? met / total : 0 }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
        />
      </div>
    </div>
  );
}

export function XIBuilder({ roomId, team, submitted, onSubmit, lastError, lastNotice }: XIBuilderProps) {
  const squad = useMemo(() => team.playersBought.map((b) => PLAYERS_BY_ID[b.playerId]).filter(Boolean) as Player[], [team]);
  const priceOf = (id: string) => team.playersBought.find((b) => b.playerId === id)?.soldPrice ?? 0;

  const [draft, setDraft] = useState<PlayingXIDraft>(() => {
    const saved = loadDraft(roomId, team.id);
    if (saved) return saved;
    if (submitted) return { ...submitted };
    return squad.length >= XI_SIZE ? buildBestXIDraft(team) : EMPTY;
  });
  const [hint, setHint] = useState('');
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(roomId, team.id), JSON.stringify(draft));
    } catch {
      // Private mode or full storage: the draft just won't survive a refresh.
    }
  }, [draft, roomId, team.id]);

  // The server confirmed a submission: clear the pending state.
  useEffect(() => {
    if (submitted) setPendingSubmit(false);
  }, [submitted?.submittedAt]);
  useEffect(() => {
    if (lastError) setPendingSubmit(false);
  }, [lastError]);

  const rules = useMemo(() => checkPlayingXI(draft, squad, PLAYERS_BY_ID), [draft, squad]);
  const errors = rules.filter((r) => r.severity === 'error' && !r.ok);
  const required = rules.filter((r) => r.severity === 'error');
  const requiredMet = required.length - errors.length;
  const xiPlayers = draft.playerIds.map((id) => PLAYERS_BY_ID[id]).filter(Boolean) as Player[];
  const overseas = xiPlayers.filter((p) => p.isOverseas).length;
  const bowlingOptions = xiPlayers.filter((p) => p.role === 'BOWLER' || p.role === 'ALL_ROUNDER').length;
  const keepers = xiPlayers.filter((p) => p.role === 'WICKET_KEEPER').length;
  const bench = squad.filter((p) => !draft.playerIds.includes(p.id)).sort((a, b) => getPlayerRating(b).overall - getPlayerRating(a).overall);
  const isSaved = !!submitted && sameDraft(draft, submitted);

  const update = (fn: (d: PlayingXIDraft) => PlayingXIDraft) => {
    setHint('');
    setDraft((d) => fn(d));
  };

  const addToXI = (p: Player) => {
    if (draft.playerIds.length >= XI_SIZE) {
      setHint(`Your XI already has ${XI_SIZE} players. Drop someone first.`);
      return;
    }
    if (p.isOverseas && overseas >= MAX_OVERSEAS_IN_XI) {
      setHint(`Only ${MAX_OVERSEAS_IN_XI} overseas players can play. Drop an overseas player first.`);
      return;
    }
    update((d) => ({
      ...d,
      playerIds: [...d.playerIds, p.id],
      battingOrder: [...d.battingOrder, p.id],
      impactSubIds: d.impactSubIds.filter((id) => id !== p.id),
      wicketKeeperId: d.wicketKeeperId || (p.role === 'WICKET_KEEPER' ? p.id : ''),
    }));
  };

  const removeFromXI = (id: string) =>
    update((d) => ({
      ...d,
      playerIds: d.playerIds.filter((x) => x !== id),
      battingOrder: d.battingOrder.filter((x) => x !== id),
      captainId: d.captainId === id ? '' : d.captainId,
      viceCaptainId: d.viceCaptainId === id ? '' : d.viceCaptainId,
      wicketKeeperId: d.wicketKeeperId === id ? '' : d.wicketKeeperId,
    }));

  const move = (id: string, dir: -1 | 1) =>
    update((d) => {
      const order = [...d.battingOrder];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...d, battingOrder: order };
    });

  // C and VC are exclusive: making the VC captain swaps them.
  const designate = (id: string, as: 'C' | 'VC' | 'WK') =>
    update((d) => {
      if (as === 'WK') return { ...d, wicketKeeperId: d.wicketKeeperId === id ? '' : id };
      if (as === 'C') {
        if (d.captainId === id) return { ...d, captainId: '' };
        return { ...d, captainId: id, viceCaptainId: d.viceCaptainId === id ? d.captainId : d.viceCaptainId };
      }
      if (d.viceCaptainId === id) return { ...d, viceCaptainId: '' };
      return { ...d, viceCaptainId: id, captainId: d.captainId === id ? d.viceCaptainId : d.captainId };
    });

  const toggleSub = (p: Player) => {
    if (draft.impactSubIds.includes(p.id)) {
      update((d) => ({ ...d, impactSubIds: d.impactSubIds.filter((x) => x !== p.id) }));
      return;
    }
    if (draft.impactSubIds.length >= MAX_IMPACT_SUBS) {
      setHint(`You can name up to ${MAX_IMPACT_SUBS} impact substitutes.`);
      return;
    }
    if (p.isOverseas && overseas >= MAX_OVERSEAS_IN_XI) {
      setHint('Your XI already has 4 overseas players, so an overseas substitute could never come on.');
      return;
    }
    update((d) => ({ ...d, impactSubIds: [...d.impactSubIds, p.id] }));
  };

  const autoPick = () => update(() => buildBestXIDraft(team));
  const clearAll = () => update(() => EMPTY);
  const tidyOrder = () => update((d) => ({ ...d, battingOrder: suggestBattingOrder(d.playerIds) }));

  const submit = () => {
    if (errors.length > 0 || !onSubmit) return;
    setPendingSubmit(true);
    onSubmit({ ...draft, playerIds: [...draft.battingOrder] });
    // Never leave the button spinning if the server stays silent.
    window.setTimeout(() => setPendingSubmit(false), 6000);
  };

  // ── Not enough players for a legal XI ────────────────────────────────────────
  if (squad.length < XI_SIZE) {
    const byRole = ROLE_GROUPS.map((g) => ({ ...g, n: squad.filter((p) => p.role === g.role).length }));
    return (
      <Panel className="p-6">
        <p className="font-display text-2xl font-extrabold uppercase italic text-ink">{team.name} can't field an XI</p>
        <p className="mt-2 max-w-2xl text-ink-2">
          The squad has {squad.length} {squad.length === 1 ? 'player' : 'players'}; a Playing XI needs {XI_SIZE}. You are {XI_SIZE - squad.length} short, so a legal XI
          can't be submitted for this auction.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {byRole.map((g) => (
            <div key={g.role} className="rounded-xl border border-line bg-night/50 px-3 py-2">
              <dt className="text-xs text-ink-3">{g.label}</dt>
              <dd className="font-display text-2xl font-bold tabular text-ink">{g.n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-ink-3">
          A legal XI also needs a wicket-keeper, at least {MIN_BOWLING_OPTIONS} bowling options and no more than {MAX_OVERSEAS_IN_XI} overseas players.
        </p>
      </Panel>
    );
  }

  const submitLabel = pendingSubmit ? 'Submitting' : submitted ? (isSaved ? 'Submitted' : 'Resubmit XI') : 'Submit XI';

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <Panel className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CountBadge label="Playing XI" value={draft.playerIds.length} max={XI_SIZE} ok={draft.playerIds.length === XI_SIZE} />
          <CountBadge label="Overseas" value={overseas} max={MAX_OVERSEAS_IN_XI} ok={overseas <= MAX_OVERSEAS_IN_XI && draft.playerIds.length === XI_SIZE} />
          <CountBadge label="Bowling options" value={bowlingOptions} max={MIN_BOWLING_OPTIONS} ok={bowlingOptions >= MIN_BOWLING_OPTIONS} />
          <CountBadge label="Keepers" value={keepers} ok={keepers >= 1 && !!draft.wicketKeeperId} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={autoPick}>
            Auto-pick best XI
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={clearAll} disabled={draft.playerIds.length === 0}>
            Clear
          </Button>
        </div>
      </Panel>

      <AnimatePresence initial={false}>
        {(hint || lastError || lastNotice) && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            {hint && <Notice tone="error">{hint}</Notice>}
            {lastError && <Notice tone="error">{lastError}</Notice>}
            {lastNotice && !lastError && <Notice tone="success">{lastNotice}</Notice>}
          </motion.div>
        )}
      </AnimatePresence>

      <LayoutGroup>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.8fr)]">
        {/* Your XI, in batting order */}
        <Panel className="order-1 lg:order-2">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Your XI</h2>
              <p className="text-xs text-ink-3">Batting order, top to bottom. Drag or use the arrows.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={tidyOrder} disabled={draft.playerIds.length < 2}>
              Suggest order
            </Button>
          </div>
          <div className="p-3">
            {draft.battingOrder.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-ink-3">Tap players in your squad to add them, or use Auto-pick.</p>
            ) : (
              <Reorder.Group axis="y" values={draft.battingOrder} onReorder={(order) => update((d) => ({ ...d, battingOrder: order }))} className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {draft.battingOrder.map((id, i) => (
                    <OrderRow
                      key={id}
                      id={id}
                      index={i}
                      total={draft.battingOrder.length}
                      draft={draft}
                      onMove={move}
                      onRemove={removeFromXI}
                      onDesignate={designate}
                    />
                  ))}
                </AnimatePresence>
              </Reorder.Group>
            )}
            {Array.from({ length: Math.max(0, XI_SIZE - draft.battingOrder.length) }).map((_, i) => (
              <motion.div
                key={`empty-${draft.battingOrder.length + i}`}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="mt-1.5 flex h-12 items-center gap-3 rounded-xl border border-dashed border-line px-3 text-sm text-ink-3"
              >
                <span className="w-6 text-right font-display font-bold tabular">{draft.battingOrder.length + i + 1}</span> Empty slot
              </motion.div>
            ))}
          </div>
        </Panel>

        {/* Squad (bench) */}
        <Panel className="order-2 lg:order-1">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Squad</h2>
            <p className="text-xs text-ink-3">
              Tap to add to the XI. Mark up to {MAX_IMPACT_SUBS} bench players as impact substitutes ({draft.impactSubIds.length}/{MAX_IMPACT_SUBS}).
            </p>
          </div>
          <div className="space-y-4 p-3">
            {bench.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-3">Everyone in your squad is in the XI.</p>}
            {ROLE_GROUPS.map((group) => {
              const players = bench.filter((p) => p.role === group.role);
              if (players.length === 0) return null;
              return (
                <section key={group.role}>
                  <h3 className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-widest text-ink-3">
                    {group.label} <span className="tabular">({players.length})</span>
                  </h3>
                  <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {players.map((p) => {
                        const rating = getPlayerRating(p).overall;
                        const isSub = draft.impactSubIds.includes(p.id);
                        return (
                          <motion.li
                            key={p.id}
                            layout
                            initial={{ opacity: 0, x: -24 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                            className={`flex items-center gap-2 rounded-xl border p-1.5 pr-2 ${isSub ? 'border-ipl-blue-bright/50 bg-ipl-blue-bright/5' : 'border-line bg-night/40'}`}
                          >
                            <button
                              type="button"
                              onClick={() => addToXI(p)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left transition-colors hover:bg-pitch-2"
                              aria-label={`Add ${p.name} to the XI`}
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ipl-orange/15 text-ipl-orange" aria-hidden>
                                <Plus className="h-4 w-4" />
                              </span>
                              <PlayerPhoto player={p} className="h-10 w-8 shrink-0 rounded-md bg-pitch-3" />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                                  <span className="truncate">{p.name}</span>
                                  {p.isOverseas && <Globe className="h-3.5 w-3.5 shrink-0 text-ipl-blue-bright" aria-label="Overseas" />}
                                </span>
                                <Price value={priceOf(p.id)} className="text-xs" />
                              </span>
                            </button>
                            <button
                              type="button"
                              aria-pressed={isSub}
                              onClick={() => toggleSub(p)}
                              title={isSub ? 'Remove as impact substitute' : 'Name as impact substitute'}
                              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${
                                isSub ? 'bg-ipl-blue-bright text-night' : 'border border-line text-ink-3 hover:text-ink'
                              }`}
                            >
                              <Repeat className="h-3.5 w-3.5" aria-hidden /> Sub
                            </button>
                            <RatingChip value={rating} small />
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </section>
              );
            })}
            <p className="px-1 text-xs text-ink-3">
              Impact Player rule: one named substitute can replace a player mid-match. If your XI has {MAX_OVERSEAS_IN_XI} overseas players, overseas substitutes
              can't be used.
            </p>
          </div>
        </Panel>

        {/* Rules + submit */}
        <Panel className="order-3 lg:sticky lg:top-20">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-xl font-bold uppercase tracking-wide text-ink">Team rules</h2>
            <p className="text-xs text-ink-3" aria-live="polite">
              {errors.length === 0 ? 'All rules met. Ready to submit.' : `${errors.length} ${errors.length === 1 ? 'rule' : 'rules'} still to meet.`}
            </p>
            <RulesMeter met={requiredMet} total={required.length} className="mt-3" />
          </div>
          <ul className="space-y-1 p-3">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
          </ul>
          {/* On phones the sticky bar below carries the submit button. */}
          <div className="hidden space-y-2 border-t border-line p-4 lg:block">
            <Button
              variant={isSaved ? 'success' : 'primary'}
              size="lg"
              fullWidth
              loading={pendingSubmit}
              disabled={errors.length > 0 || !onSubmit || isSaved}
              icon={isSaved ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
              onClick={submit}
            >
              {submitLabel}
            </Button>
            <p className="text-center text-xs text-ink-3">
              {!onSubmit
                ? 'Submitting is unavailable on this screen.'
                : errors.length > 0
                  ? `First fix: ${errors[0].label.toLowerCase()} (${errors[0].detail.toLowerCase()}).`
                  : isSaved
                    ? `Submitted ${new Date(submitted!.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Change anything to resubmit.`
                    : submitted
                      ? 'You have unsaved changes to your submitted XI.'
                      : 'Everyone in the room sees your team sheet once submitted.'}
            </p>
            {draft.captainId && (
              <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-ink-2">
                <Mark>C</Mark> {PLAYERS_BY_ID[draft.captainId]?.shortName}
                {draft.viceCaptainId && (
                  <>
                    <Mark>VC</Mark> {PLAYERS_BY_ID[draft.viceCaptainId]?.shortName}
                  </>
                )}
                {draft.wicketKeeperId && (
                  <>
                    <Mark>WK</Mark> {PLAYERS_BY_ID[draft.wicketKeeperId]?.shortName}
                  </>
                )}
              </p>
            )}
          </div>
        </Panel>
      </div>
      </LayoutGroup>

      {/* Phones and tablets: the submit button follows you down the page. Sticky (not fixed),
          so it never escapes the builder or fights the page's transforms. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line-strong bg-night/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-16px_rgb(0_0_0/0.8)] backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
        <div className="flex items-center gap-3">
          <RulesMeter met={requiredMet} total={required.length} className="min-w-0 flex-1" />
          <Button
            variant={isSaved ? 'success' : 'primary'}
            loading={pendingSubmit}
            disabled={errors.length > 0 || !onSubmit || isSaved}
            icon={isSaved ? <CheckCircle2 className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            onClick={submit}
          >
            {submitLabel}
          </Button>
        </div>
        <p className="mt-1.5 truncate text-xs text-ink-3">
          {!onSubmit
            ? 'Submitting opens when the auction ends.'
            : errors.length > 0
              ? `Next: ${errors[0].label.toLowerCase()}`
              : isSaved
                ? 'Submitted. Change anything to resubmit.'
                : 'Ready. Everyone sees your team sheet once submitted.'}
        </p>
      </div>
    </div>
  );
}
