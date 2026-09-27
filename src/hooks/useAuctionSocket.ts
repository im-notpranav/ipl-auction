import { useEffect, useRef, useState, useCallback } from 'react';
import { AuctionRoomState, AuctionSettings, ChatMessage, PlayingXIDraft, WSMessage } from '../types';
import { sounds } from '../utils/audio';

export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export type ClockSettingsPatch = Partial<Pick<AuctionSettings, 'bidTimerSeconds' | 'autoAdvance' | 'autoAdvanceDelaySeconds'>>;

const MESSAGE_MS = 4000;
const OFFSET_SAMPLES = 8;

export function useAuctionSocket(roomId: string | null, participantId: string | null) {
  const [roomState, setRoomState] = useState<AuctionRoomState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('OFFLINE');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastNotice, setLastNotice] = useState<string | null>(null);
  const [roomNotFound, setRoomNotFound] = useState(false);
  // serverTime - Date.now(); add it to Date.now() to read the server's clock.
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetSamplesRef = useRef<number[]>([]);
  const prevBidVersionRef = useRef<number>(0);
  const prevStatusRef = useRef<string>('');
  const prevPlayerIdRef = useRef<string | null>(null);
  const prevLeaderRef = useRef<string | null>(null);

  // Transient messages clear themselves; a newer message restarts the timer.
  const flashError = useCallback((message: string) => {
    setLastError(message);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setLastError(null), MESSAGE_MS);
  }, []);
  const flashNotice = useCallback((message: string) => {
    setLastNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setLastNotice(null), MESSAGE_MS);
  }, []);

  // Each sample is (server send time - local receive time) = true offset - latency,
  // so the largest recent sample is the best estimate of the true offset.
  const recordServerTime = useCallback((serverTime: string | undefined) => {
    const t = serverTime ? Date.parse(serverTime) : NaN;
    if (!Number.isFinite(t)) return;
    const samples = offsetSamplesRef.current;
    samples.push(t - Date.now());
    if (samples.length > OFFSET_SAMPLES) samples.shift();
    const best = Math.round(Math.max(...samples));
    setServerOffsetMs((prev) => (Math.abs(prev - best) > 40 ? best : prev));
  }, []);

  const connect = useCallback(() => {
    if (!roomId || typeof window === 'undefined') return;

    setConnectionStatus(prev => (prev === 'OFFLINE' ? 'RECONNECTING' : prev));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    // Always same-origin on /auction-ws: in development Vite (whatever port it picked)
    // proxies that path to the backend on 3000; in production the Node server
    // answers WebSocket upgrades on it directly (wss:// behind an https host).
    const wsUrl = `${protocol}//${host}/auction-ws`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        setLastError(null);
        // Authenticate & Join Room
        ws.send(
          JSON.stringify({
            type: 'AUTH_JOIN',
            roomId,
            participantId,
            timestamp: new Date().toISOString(),
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          if (msg.type === 'ROOM_STATE' && msg.payload) {
            const newState: AuctionRoomState = msg.payload;
            recordServerTime(newState.serverTime);

            // Audio cues. Nothing plays on the first state after (re)connecting.
            const hydrated = prevStatusRef.current !== '';
            const playerId = newState.currentPlayer?.id ?? null;
            const myTeamId = participantId ? newState.participants[participantId]?.teamId ?? null : null;
            if (hydrated) {
              if (playerId && playerId !== prevPlayerIdRef.current) {
                sounds.playerReveal();
              } else if (newState.currentBidVersion > prevBidVersionRef.current && prevBidVersionRef.current > 0) {
                const lostLead =
                  !!myTeamId && prevLeaderRef.current === myTeamId && newState.currentHighestBidderTeamId !== myTeamId;
                if (lostLead) {
                  sounds.playOutbid();
                  navigator.vibrate?.([60, 40, 60]);
                } else {
                  sounds.playBid(newState.recentBids.filter((b) => b.playerId === playerId).length);
                }
              }
              if (newState.status === 'SOLD' && prevStatusRef.current !== 'SOLD') sounds.playSold();
              if (newState.status === 'UNSOLD' && prevStatusRef.current !== 'UNSOLD') sounds.playUnsold();
            }

            prevBidVersionRef.current = newState.currentBidVersion;
            prevStatusRef.current = newState.status;
            prevPlayerIdRef.current = playerId;
            prevLeaderRef.current = newState.currentHighestBidderTeamId;
            setRoomNotFound(false);
            setRoomState(newState);
          } else if (msg.type === 'BID_REJECTED') {
            flashError(msg.payload?.reason || 'Bid rejected');
          } else if (msg.type === 'CHAT_RECEIVED' && msg.payload) {
            setChatMessages(prev => [...prev.slice(-49), msg.payload]);
          } else if (msg.type === 'NOTICE') {
            flashNotice(msg.payload?.message || 'Done');
          } else if (msg.type === 'ERROR') {
            flashError(msg.payload?.message || 'Server error');
          }
        } catch (_) {}
      };

      ws.onclose = () => {
        // Closed on purpose (room change / unmount): don't reconnect to the old room.
        if (socketRef.current !== ws) return;
        setConnectionStatus('RECONNECTING');
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 1500);
      };

      ws.onerror = () => {
        setConnectionStatus('OFFLINE');
      };
    } catch (_) {
      setConnectionStatus('OFFLINE');
    }
  }, [roomId, participantId, flashError, flashNotice, recordServerTime]);

  useEffect(() => {
    if (!roomId) {
      setRoomState(null);
      setConnectionStatus('OFFLINE');
      setChatMessages([]);
      setLastError(null);
      setLastNotice(null);
      setRoomNotFound(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        const ws = socketRef.current;
        socketRef.current = null;
        ws.close();
      }
      return;
    }

    // Reset transient trackers for new room
    prevBidVersionRef.current = 0;
    prevStatusRef.current = '';
    prevPlayerIdRef.current = null;
    prevLeaderRef.current = null;
    offsetSamplesRef.current = [];
    setRoomNotFound(false);

    // Immediate REST hydration while WS handshakes
    // The /api/rooms/:roomId endpoint accepts both room ID and room code
    let cancelled = false;
    fetch(`/api/rooms/${roomId}`)
      .then(res => {
        if (res.status === 404 && !cancelled) setRoomNotFound(true);
        return res.ok ? res.json() : null;
      })
      .then(data => {
        if (!cancelled && data && data.id) {
          recordServerTime(data.serverTime);
          // Don't let a slow REST reply overwrite newer socket state for the same room.
          setRoomState(prev => (prev && prev.id === data.id && prev.eventSequenceNumber >= data.eventSequenceNumber ? prev : data));
        }
      })
      .catch(() => {});

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (socketRef.current) {
        const ws = socketRef.current;
        socketRef.current = null;
        ws.close();
      }
    };
  }, [roomId, connect, recordServerTime]);

  // Periodic heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'PING', roomId, timestamp: new Date().toISOString() }));
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [roomId]);

  useEffect(
    () => () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  const sendAction = useCallback(
    (type: WSMessage['type'], payload?: any) => {
      if (socketRef.current?.readyState !== WebSocket.OPEN || !roomId) {
        // Never drop a button press silently: tell the user why nothing happened.
        flashError('Not connected to the auction server. Reconnecting, try again in a moment.');
        return;
      }
      socketRef.current.send(
        JSON.stringify({
          type,
          roomId,
          participantId,
          payload,
          timestamp: new Date().toISOString(),
        })
      );
    },
    [roomId, participantId, flashError]
  );

  const placeBid = useCallback(() => {
    sendAction('PLACE_BID');
  }, [sendAction]);

  const startAuction = useCallback(() => {
    sendAction('START_AUCTION');
  }, [sendAction]);

  const pauseAuction = useCallback(() => {
    sendAction('PAUSE_AUCTION');
  }, [sendAction]);

  const resumeAuction = useCallback(() => {
    sendAction('RESUME_AUCTION');
  }, [sendAction]);

  const sellPlayer = useCallback(() => {
    sendAction('SELL_PLAYER');
  }, [sendAction]);

  const markUnsold = useCallback(() => {
    sendAction('MARK_UNSOLD');
  }, [sendAction]);

  const nextPlayer = useCallback(() => {
    sendAction('NEXT_PLAYER');
  }, [sendAction]);

  const endAuction = useCallback(() => {
    sendAction('END_AUCTION');
  }, [sendAction]);

  const kickParticipant = useCallback((targetPartId: string) => {
    sendAction('KICK_PARTICIPANT', { participantId: targetPartId });
  }, [sendAction]);

  const sendChat = useCallback((text: string) => {
    sendAction('SEND_CHAT', { text });
  }, [sendAction]);

  // Auctioneer clock controls.
  const extendTimer = useCallback((seconds: number) => {
    sendAction('EXTEND_TIMER', { seconds });
  }, [sendAction]);

  const updateSettings = useCallback((patch: ClockSettingsPatch) => {
    sendAction('UPDATE_SETTINGS', patch);
  }, [sendAction]);

  const undoLastSale = useCallback(() => {
    sendAction('UNDO_LAST_SALE');
  }, [sendAction]);

  // Team owner, after the auction: the server validates with playingXIRules and
  // answers with NOTICE (lastNotice) or ERROR (lastError).
  const submitPlayingXI = useCallback((draft: PlayingXIDraft) => {
    sendAction('SUBMIT_PLAYING_XI', draft);
  }, [sendAction]);

  return {
    roomState,
    connectionStatus,
    chatMessages,
    lastError,
    lastNotice,
    roomNotFound,
    serverOffsetMs,
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
    extendTimer,
    updateSettings,
    undoLastSale,
    submitPlayingXI,
  };
}
