import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Volume2, VolumeX, Maximize2, Minimize2, Tv, Smartphone, HelpCircle, Database, Home, Menu } from 'lucide-react';
import { sounds } from '../utils/audio';
import { ConnectionStatus } from '../hooks/useAuctionSocket';
import { Button, IconButton, StatusBadge, Wordmark } from './ui';

interface NavbarProps {
  roomId?: string | null;
  roomName?: string;
  auctionStatus?: string;
  connectionStatus?: ConnectionStatus;
  userRole?: 'AUCTIONEER' | 'PARTICIPANT' | null;
  onOpenHowItWorks: () => void;
  onNavigate: (view: string) => void;
}

const CONNECTION_META: Record<ConnectionStatus, { label: string; dot: string }> = {
  CONNECTED: { label: 'Connected', dot: 'bg-live' },
  RECONNECTING: { label: 'Reconnecting', dot: 'bg-ipl-gold animate-pulse' },
  OFFLINE: { label: 'Offline', dot: 'bg-danger' },
};

// Volume popover: mute, level, and a test cue so the room can set levels before starting.
function SoundControl() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => sounds.subscribe(() => force((n) => n + 1)), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const muted = sounds.isMuted;
  const level = Math.round(sounds.volume * 100);

  return (
    <div ref={ref} className="relative">
      <IconButton label="Sound settings" onClick={() => setOpen((o) => !o)} active={!muted} aria-expanded={open}>
        {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            className="absolute right-0 top-12 z-50 w-64 origin-top-right rounded-2xl border border-line-strong bg-pitch p-4 shadow-pop"
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold uppercase tracking-wide text-ink">Sound</p>
              <button onClick={() => (sounds.isMuted = !muted)} className="-mr-2 min-h-9 rounded-lg px-2 text-sm font-semibold text-ipl-orange transition-colors hover:bg-ipl-orange/10">
                {muted ? 'Unmute' : 'Mute'}
              </button>
            </div>
            <label htmlFor="volume" className="mt-3 flex items-center justify-between text-sm text-ink-2">
              Volume <span className="tabular text-ink">{muted ? 'Muted' : `${level}%`}</span>
            </label>
            <input
              id="volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={level}
              disabled={muted}
              onChange={(e) => (sounds.volume = Number(e.target.value) / 100)}
              className="mt-2 w-full accent-[var(--color-ipl-orange)] disabled:opacity-40"
            />
            <Button size="sm" fullWidth className="mt-3" disabled={muted} onClick={() => sounds.playerReveal()}>
              Test sound
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  roomName,
  auctionStatus,
  connectionStatus = 'OFFLINE',
  userRole,
  onOpenHowItWorks,
  onNavigate,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Stay accurate when the user leaves fullscreen with Esc.
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  const connection = CONNECTION_META[connectionStatus];
  // App re-renders the navbar on every navigation, so the path is current here.
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  const onDatabase = path.startsWith('/data-health');
  const onMyScreen = path.startsWith('/auctioneer') || path.startsWith('/room');

  const myScreen =
    roomId && userRole === 'AUCTIONEER'
      ? { label: 'Auctioneer screen', icon: Tv, view: 'auctioneer' }
      : roomId && userRole === 'PARTICIPANT'
        ? { label: 'My bidding screen', icon: Smartphone, view: 'room' }
        : null;

  const menuItems = [
    ...(myScreen ? [{ label: myScreen.label, icon: myScreen.icon, active: onMyScreen, onSelect: () => onNavigate(myScreen.view) }] : []),
    { label: 'Home', icon: Home, active: path === '/', onSelect: () => onNavigate('dashboard') },
    { label: 'Player database', icon: Database, active: onDatabase, onSelect: () => onNavigate('data-health') },
    { label: 'How it works', icon: HelpCircle, active: false, onSelect: onOpenHowItWorks },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button onClick={() => onNavigate('dashboard')} aria-label="Auction Arena home" className="shrink-0 rounded-lg transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]">
            <span className="hidden sm:block"><Wordmark /></span>
            <span className="sm:hidden"><Wordmark compact /></span>
          </button>

          {roomName && (
            <div className="flex min-w-0 items-center gap-2.5 border-l border-line pl-3 sm:pl-4">
              <span className="hidden truncate font-display text-lg font-semibold uppercase tracking-wide text-ink-2 md:block">{roomName}</span>
              {auctionStatus && <StatusBadge status={auctionStatus} />}
            </div>
          )}
        </div>

        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="Tools">
          {roomId && (
            <span className="mr-1 inline-flex items-center gap-2 text-sm font-medium text-ink-2" role="status">
              <span className={`h-2.5 w-2.5 rounded-full ${connection.dot}`} aria-hidden />
              <span className="sr-only sm:not-sr-only">{connection.label}</span>
            </span>
          )}

          {/* Desktop: every tool visible */}
          {myScreen && (
            <IconButton label={myScreen.label} active={onMyScreen} onClick={() => onNavigate(myScreen.view)} className="hidden sm:inline-flex">
              <myScreen.icon className="h-[18px] w-[18px]" />
            </IconButton>
          )}
          <IconButton label="Player database" active={onDatabase} onClick={() => onNavigate('data-health')} className="hidden sm:inline-flex">
            <Database className="h-[18px] w-[18px]" />
          </IconButton>
          <SoundControl />
          <IconButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} className="hidden sm:inline-flex">
            {isFullscreen ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
          </IconButton>
          <IconButton label="How it works" onClick={onOpenHowItWorks} className="hidden sm:inline-flex">
            <HelpCircle className="h-[18px] w-[18px]" />
          </IconButton>

          {/* Phone: secondary tools collapse into one menu */}
          <MobileMenu items={menuItems} />
        </nav>
      </div>
    </header>
  );
};

interface MenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onSelect: () => void;
}

function MobileMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <IconButton label="Menu" aria-expanded={open} aria-haspopup="menu" active={open} onClick={() => setOpen((o) => !o)}>
        <Menu className="h-5 w-5" />
      </IconButton>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            className="absolute right-0 top-13 z-50 w-60 origin-top-right overflow-hidden rounded-2xl border border-line-strong bg-pitch p-1.5 shadow-pop"
          >
            {items.map(({ label, icon: Icon, active, onSelect }) => (
              <button
                key={label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect();
                }}
                className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-semibold transition-colors ${
                  active ? 'bg-ipl-orange/10 text-ipl-orange' : 'text-ink hover:bg-pitch-2 active:bg-pitch-3'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
