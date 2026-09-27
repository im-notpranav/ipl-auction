import React, { useState, useEffect, useCallback } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { Loader2, SearchX } from 'lucide-react';
import { Button } from './components/ui';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { AuctioneerScreen } from './components/AuctioneerScreen';
import { ParticipantView } from './components/ParticipantView';
import { LobbyView } from './components/LobbyView';
import { PostAuctionView } from './components/PostAuctionView';
import { DataHealthView } from './components/DataHealthView';
import { CreateAuctionModal } from './components/CreateAuctionModal';
import { HowItWorksModal } from './components/HowItWorksModal';
import { useAuctionSocket } from './hooks/useAuctionSocket';
import { UserRole } from './types';
import { getSession, saveSession as storeSession, getLastRoomId } from './utils/session';

export default function App() {
  // Navigation & Session State
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);

  // Take on whatever identity this browser saved for the room (auctioneer, team, or none).
  const adoptSession = useCallback((roomId: string) => {
    const session = getSession(roomId);
    setParticipantId(session?.participantId ?? null);
    setUserRole(session?.role ?? null);
    return session;
  }, []);

  // Sync state from current URL and browser history
  const syncFromUrl = useCallback(() => {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);

    // Root or dashboard route
    if (parts.length === 0 || parts[0] === 'dashboard' || parts[0] === 'home') {
      setActiveView('dashboard');
      setActiveRoomId(null);
      return;
    }

    // Data health route
    if (parts[0] === 'data-health') {
      setActiveView('data-health');
      setActiveRoomId(null);
      return;
    }

    // Deep link routes: /auctioneer/:id, /results/:id, /join/:code, /room/:id
    if (parts.length >= 2) {
      const mode = parts[0];
      const rId = parts[1];

      if (mode === 'auctioneer' || mode === 'projector') {
        setActiveRoomId(rId);
        setActiveView('auctioneer');
        adoptSession(rId);
        return;
      }

      if (mode === 'results') {
        setActiveRoomId(rId);
        setActiveView('post-auction');
        adoptSession(rId);
        return;
      }

      if (mode === 'join') {
        // rId might be a room code or room ID — resolve to canonical ID
        fetch(`/api/rooms/${rId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            const roomId = data && data.id ? data.id : rId;
            setActiveRoomId(roomId);
            // Someone who already registered here goes straight back to their screen.
            const session = adoptSession(roomId);
            setActiveView(session ? (session.role === 'AUCTIONEER' ? 'auctioneer' : 'room') : 'lobby');
          })
          .catch(() => {
            setActiveRoomId(rId);
            setActiveView('lobby');
          });
        return;
      }

      if (mode === 'room') {
        setActiveRoomId(rId);
        setActiveView(adoptSession(rId) ? 'room' : 'lobby');
        return;
      }
    }

    // Fallback: stay on dashboard
    setActiveView('dashboard');
    setActiveRoomId(null);
  }, [adoptSession]);

  useEffect(() => {
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [syncFromUrl]);

  // Save active session for persistence during active auction
  const saveSession = useCallback((roomId: string, partId: string, role: UserRole) => {
    setActiveRoomId(roomId);
    setParticipantId(partId);
    setUserRole(role);
    storeSession(roomId, { participantId: partId, role });
  }, []);

  // Leave the room screen. The saved identity is kept so "Resume" and room
  // links still work; wiping it used to strip the auctioneer of control.
  const handleReturnHome = useCallback(() => {
    setActiveRoomId(null);
    setActiveView('dashboard');
    window.history.pushState({}, '', '/');
  }, []);

  // Real-time WebSocket connection hook (scoped strictly to activeRoomId)
  const {
    roomState,
    connectionStatus,
    chatMessages,
    lastError,
    placeBid,
    startAuction,
    pauseAuction,
    resumeAuction,
    sellPlayer,
    markUnsold,
    nextPlayer,
    endAuction,
    kickParticipant,
    sendChat,
    lastNotice,
    roomNotFound,
    serverOffsetMs,
    extendTimer,
    updateSettings,
    undoLastSale,
    submitPlayingXI,
  } = useAuctionSocket(activeRoomId, participantId);

  // Handle Auction creation (creates a brand new independent auction every time)
  // POSTs JSON and returns the body, throwing a readable message on any failure
  // so the calling form can show it inline.
  const postJson = async (url: string, body: unknown) => {
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error("Can't reach the auction server. Check it's running and try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The server rejected the request. Try again.');
    return data;
  };

  // Handle Auction creation (creates a brand new independent auction every time)
  const handleCreateRoom = async (data: { name: string; auctioneerName: string; settings: any }) => {
    const result = await postJson('/api/rooms', data);
    if (!result.roomId || !result.auctioneerId) throw new Error('The server did not return a room. Try again.');
    saveSession(result.roomId, result.auctioneerId, 'AUCTIONEER');
    setShowCreateModal(false);
    setActiveView('auctioneer');
    window.history.pushState({}, '', `/auctioneer/${result.roomId}`);
  };

  // Handle Participant Registration — supports both roomCode and roomId
  const handleJoinAsTeam = async (formData: { displayName: string; teamName: string; teamShortName: string; color: string }) => {
    if (!activeRoomId) throw new Error('No auction room is open.');
    const data = await postJson(`/api/rooms/${activeRoomId}/join`, formData);
    if (!data.participantId) throw new Error('Could not register your team. Try again.');
    // Always use the canonical roomId (not code) for socket/API calls
    const canonicalRoomId = data.roomId || activeRoomId;
    saveSession(canonicalRoomId, data.participantId, 'PARTICIPANT');
    setActiveRoomId(canonicalRoomId);
    setActiveView('room');
    window.history.pushState({}, '', `/room/${canonicalRoomId}`);
  };

  const handleJoinRoomDirect = (roomIdOrCode: string) => {
    window.history.pushState({}, '', `/join/${roomIdOrCode}`);
    syncFromUrl();
  };

  const handleNavigate = (view: string, roomId?: string) => {
    if (view === 'dashboard' || view === 'home') {
      handleReturnHome();
      return;
    }

    if (view === 'data-health') {
      setActiveRoomId(null);
      setActiveView('data-health');
      window.history.pushState({}, '', '/data-health');
      return;
    }

    if (view === 'results' && (roomId || activeRoomId)) {
      const targetId = roomId || activeRoomId!;
      setActiveRoomId(targetId);
      adoptSession(targetId);
      setActiveView('post-auction');
      window.history.pushState({}, '', `/results/${targetId}`);
      return;
    }

    // Navigate back to auctioneer/room view using current active room
    if ((view === 'auctioneer' || view === 'room') && (roomId || activeRoomId)) {
      const targetId = roomId || activeRoomId!;
      setActiveRoomId(targetId);
      adoptSession(targetId);
      setActiveView(view);
      window.history.pushState({}, '', `/${view}/${targetId}`);
      return;
    }

    if (roomId) {
      setActiveRoomId(roomId);
      setActiveView(view);
      window.history.pushState({}, '', `/${view}/${roomId}`);
    } else {
      setActiveView(view);
      window.history.pushState({}, '', `/${view}`);
    }
  };

  const lastRoomId = activeRoomId ?? getLastRoomId();

  // Determine what view to render based on clean routing state
  // Returns the screen plus a key naming it, so screen changes can animate.
  const renderCurrentView = (): [string, React.ReactNode] => {
    if (activeView === 'data-health') {
      return ['data-health', <DataHealthView />];
    }

    // Explicit Dashboard view or no active room selected
    if (activeView === 'dashboard' || !activeRoomId) {
      return ['dashboard', (
        <DashboardView
          onOpenCreate={() => setShowCreateModal(true)}
          onOpenHowItWorks={() => setShowHowItWorksModal(true)}
          onNavigate={handleNavigate}
          onJoinRoomDirect={handleJoinRoomDirect}
          recentRoomId={lastRoomId}
          recentRole={lastRoomId ? getSession(lastRoomId)?.role ?? null : null}
        />
      )];
    }

    // The link points at a room the server doesn't know (typo, or a deleted room).
    if (!roomState && roomNotFound) {
      return ['not-found', (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
          <SearchX className="h-12 w-12 text-ipl-orange" aria-hidden />
          <p className="font-display text-3xl font-extrabold uppercase italic tracking-wide text-ink">Auction room not found</p>
          <p className="max-w-md text-ink-2">
            There's no auction with the code <span className="font-display font-bold tracking-widest text-ink">{activeRoomId}</span>. Check the code on the
            auctioneer's screen and try again.
          </p>
          <Button variant="primary" onClick={handleReturnHome}>Back to home</Button>
        </div>
      )];
    }

    // If an activeRoomId is requested but roomState has not loaded yet:
    if (!roomState) {
      return ['loading', (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center" role="status">
          <Loader2 className="h-10 w-10 animate-spin text-ipl-orange" aria-hidden />
          <p className="font-display text-2xl font-bold uppercase tracking-wide text-ink">Joining the auction room</p>
          <p className="text-ink-2">Room {activeRoomId}</p>
          <Button variant="ghost" onClick={handleReturnHome}>Back to home</Button>
        </div>
      )];
    }

    // If auction is completed or results explicitly viewed, render post-auction analysis
    if (roomState.status === 'COMPLETED' || activeView === 'post-auction') {
      return ['results', (
        <PostAuctionView
          roomState={roomState}
          participantId={participantId}
          onReturnHome={handleReturnHome}
          onSubmitPlayingXI={submitPlayingXI}
          lastError={lastError}
          lastNotice={lastNotice}
        />
      )];
    }

    // If auctioneer: unified projector-grade auctioneer screen
    if (activeView === 'auctioneer' || userRole === 'AUCTIONEER') {
      return ['auctioneer', (
        <AuctioneerScreen
          roomState={roomState}
          canControl={!!participantId && participantId === roomState.auctioneerId}
          lastError={lastError}
          onStartAuction={startAuction}
          onPauseAuction={pauseAuction}
          onResumeAuction={resumeAuction}
          onSellPlayer={sellPlayer}
          onMarkUnsold={markUnsold}
          onNextPlayer={nextPlayer}
          onEndAuction={endAuction}
          onKickParticipant={kickParticipant}
          serverOffsetMs={serverOffsetMs}
          onExtendTimer={extendTimer}
          onUpdateSettings={updateSettings}
          onUndoLastSale={undoLastSale}
        />
      )];
    }

    // If in lobby / registration (only if auction hasn't started)
    if (
      (roomState.status === 'LOBBY' || roomState.status === 'READY' || activeView === 'lobby') &&
      roomState.status !== 'BIDDING' &&
      roomState.status !== 'PAUSED' &&
      roomState.status !== 'SOLD' &&
      roomState.status !== 'UNSOLD'
    ) {
      return ['lobby', (
        <LobbyView
          roomState={roomState}
          participantId={participantId}
          onJoinAsTeam={handleJoinAsTeam}
          onStartAuction={startAuction}
          onKickParticipant={kickParticipant}
        />
      )];
    }

    // Default: Participant active bidding device
    return ['paddle', (
      <ParticipantView
        roomState={roomState}
        participantId={participantId || ''}
        chatMessages={chatMessages}
        lastError={lastError}
        onPlaceBid={placeBid}
        onSendChat={sendChat}
        serverOffsetMs={serverOffsetMs}
      />
    )];
  };

  const [viewKey, view] = renderCurrentView();
  // Room screens have fixed bars and overlays; a transformed wrapper would re-anchor them
  // mid-transition, so those screens only cross-fade.
  const slide = viewKey === 'dashboard' || viewKey === 'data-health' || viewKey === 'results' ? 14 : 0;

  return (
    <MotionConfig reducedMotion="user">
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-ipl-orange focus:px-4 focus:py-2 focus:font-semibold focus:text-night">
        Skip to content
      </a>
      <Navbar
        roomId={activeRoomId}
        roomName={roomState?.name}
        auctionStatus={roomState?.status}
        connectionStatus={connectionStatus}
        userRole={userRole}
        onOpenHowItWorks={() => setShowHowItWorksModal(true)}
        onNavigate={handleNavigate}
      />

      <main id="main" className="flex-1">
        {/* Enter-only transition: every screen change remounts and eases in. No exit
            phase, so rapid changes (home -> loading -> lobby) can never stall on an old screen. */}
        <motion.div
          key={`${viewKey}-${activeRoomId ?? ''}`}
          initial={{ opacity: 0, y: slide }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {view}
        </motion.div>
      </main>

      {/* Global Modals */}
      <CreateAuctionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateRoom={handleCreateRoom}
      />

      <HowItWorksModal
        isOpen={showHowItWorksModal}
        onClose={() => setShowHowItWorksModal(false)}
      />
    </div>
    </MotionConfig>
  );
}
