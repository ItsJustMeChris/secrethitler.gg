'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PolicyBoard, PolicyCard, asset } from './game-board';
import { useGameFeedback } from './game-feedback';
import {
  isYourTurn,
  electionResult,
  legislativeGuidance,
  policyResult,
  playerOffice,
  playerSelection,
} from '@/lib/game-presentation';
import { closedDossier, dossierReducer } from '@/lib/dossier';
import { connectTable, type TableView } from '@/lib/table-connection';
import { GameDialog as Dialog } from './game-dialog';
import {
  Settings2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  EyeOff,
  FileText,
  Flag,
  HelpCircle,
  LockKeyhole,
  MessageCircle,
  Plus,
  Pause,
  Play,
  StepForward,
  Send,
  ShieldCheck,
  Skull,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { coachTip } from '@/lib/coach';
import type { Action, GameView, Power } from '@/lib/game';
import { FairPlayProof, rememberFairness } from './fair-play';
import { PortraitPicker } from './portrait-picker';
import { ElectionRecap, PlayerEvent, PolicyRecap } from './table-events';
import { InvestigationDialog } from './investigation-dialog';
import { PORTRAITS, isPortrait, portraitUrl } from '@/lib/portraits';
import { playerKnowledge } from '@/lib/player-knowledge';

type View = TableView;
const powerNames: Record<Power, string> = {
  investigate: 'Investigate loyalty',
  'special-election': 'Special election',
  peek: 'Policy peek',
  execute: 'Execution',
};
const phaseNames: Record<string, string> = {
  lobby: 'Waiting for players',
  nomination: 'Nominate a chancellor',
  voting: 'Election in progress',
  'president-discard': 'Legislative session',
  'chancellor-enact': 'Legislative session',
  'veto-response': 'Veto requested',
  executive: 'Executive action',
  finished: 'Game over',
};

export default function GameTable() {
  const [game, setGame] = useState<View | null>(null);
  const feedback = useGameFeedback();
  const receiveFeedback = feedback.receive;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [name, setName] = useState('');
  const [portrait, setPortrait] = useState(1);
  const [code, setCode] = useState('');
  const [entry, setEntry] = useState<'create' | 'join' | 'solo'>('create');
  const [seats, setSeats] = useState('5');
  const [coaching, setCoaching] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const lastSpoken = useRef('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState('');
  const dismissNotice = useCallback(() => setError(''), []);
  const [online, setOnline] = useState(true);
  const [rules, setRules] = useState(false);
  const fieldGuideRef = useRef<HTMLDivElement>(null);
  const [privacy, setPrivacy] = useState(false);
  const [dossier, updateDossier] = useReducer(dossierReducer, closedDossier);
  const roleOpen = dossier.open;
  const [copied, setCopied] = useState(false);
  const [seatOpen, setSeatOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [desktopChat, setDesktopChat] = useState(false);
  const desktopChatRef = useRef(false);
  const [chatTab, setChatTab] = useState('chat');
  const chatTabRef = useRef('chat');
  const [chatDraft, setChatDraft] = useState('');
  const [lastReadMessage, setLastReadMessage] = useState('');
  const [privateResult, setPrivateResult] = useState<
    GameView['me']['notes'][number] | null
  >(null);
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [choice, setChoice] = useState<{
    action: Action;
    title: string;
    description: string;
    phase: GameView['phase'];
    round: number;
  } | null>(null);
  const gameRef = useRef<View | null>(null);
  const pending = useRef(false);
  const connection = useRef<ReturnType<typeof connectTable> | null>(null);
  const changeChatOpen = (open: boolean) => {
    chatOpenRef.current = open;
    setChatOpen(open);
    if (open && chatTabRef.current === 'chat')
      setLastReadMessage(gameRef.current?.messages.at(-1)?.id ?? '');
  };
  const changeChatTab = (tab: string) => {
    chatTabRef.current = tab;
    setChatTab(tab);
    if (tab === 'chat')
      setLastReadMessage(gameRef.current?.messages.at(-1)?.id ?? '');
  };
  const accept = useCallback(
    (next: View) => {
      const current = gameRef.current;
      if (current?.code === next.code && current.revision > next.revision)
        return;
      receiveFeedback(current, next);
      rememberFairness(next.previousFairness, 'finished');
      rememberFairness(next.fairness, next.phase);
      const tableChanged =
        current?.code !== next.code ||
        current?.me.id !== next.me.id ||
        current?.fairness?.id !== next.fairness?.id ||
        (current.phase !== 'lobby' && next.phase === 'lobby');
      if (tableChanged) {
        setSeatOpen(false);
        setChoice(null);
        setPrivateResult(null);
        setInvestigationOpen(false);
      }
      updateDossier({
        type: 'receive',
        game: next,
        visible: !document.hidden && document.hasFocus(),
      });
      if (
        !tableChanged &&
        current &&
        next.me.notes.length > current.me.notes.length
      ) {
        const note = next.me.notes.at(-1) ?? null;
        setPrivateResult(note);
        const investigating = !!(note?.party && note.targetId);
        setInvestigationOpen(investigating);
        if (investigating) {
          updateDossier({ type: 'dismiss' });
          setSeatOpen(false);
          setSettingsOpen(false);
          setRules(false);
          setPrivacy(false);
          setChoice(null);
          chatOpenRef.current = false;
          setChatOpen(false);
        }
      }
      if (
        next.me.role &&
        !['lobby', 'finished'].includes(next.phase) &&
        (tableChanged || !current?.me.role)
      ) {
        setSettingsOpen(false);
        setRules(false);
        setPrivacy(false);
        chatOpenRef.current = false;
        setChatOpen(false);
      }
      if (current?.code !== next.code) {
        chatOpenRef.current = false;
        setChatOpen(false);
        setChatDraft('');
        chatTabRef.current = 'chat';
        setChatTab('chat');
        setLastReadMessage(next.messages.at(-1)?.id ?? '');
      }
      if (
        (chatOpenRef.current || desktopChatRef.current) &&
        chatTabRef.current === 'chat'
      )
        setLastReadMessage(next.messages.at(-1)?.id ?? '');
      gameRef.current = next;
      setGame(next);
    },
    [receiveFeedback],
  );
  const clear = () => {
    if (
      gameRef.current &&
      !['lobby', 'finished'].includes(gameRef.current.phase)
    ) {
      setCode(gameRef.current.code);
      setEntry('join');
    }
    gameRef.current = null;
    setGame(null);
    localStorage.removeItem('sh-room');
    history.replaceState(null, '', '/');
    updateDossier({ type: 'reset' });
    setReadAloud(false);
    setChoice(null);
    setSeatOpen(false);
    setPrivateResult(null);
    setInvestigationOpen(false);
    changeChatOpen(false);
    setChatDraft('');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  useEffect(() => {
    // Browser storage is read after hydration; it is unavailable during server rendering.
    // oxlint-disable-next-line react/react-compiler
    setName(localStorage.getItem('sh-name') ?? '');
    const savedPortrait = Number(localStorage.getItem('sh-portrait'));
    if (isPortrait(savedPortrait)) setPortrait(savedPortrait);
    setCoaching(localStorage.getItem('sh-coach') === 'true');
    setVoiceAvailable('speechSynthesis' in window);
    setCanFullscreen(!!document.fullscreenEnabled);
    const invite = new URLSearchParams(location.search)
      .get('room')
      ?.toUpperCase();
    const saved = invite ?? localStorage.getItem('sh-room');
    if (invite) {
      setCode(invite);
      setEntry('join');
    }
    const live = connectTable({
      code: saved ?? undefined,
      receive: (next) => {
        accept(next);
        localStorage.setItem('sh-room', next.code);
      },
      status: (connected) => {
        setOnline(connected);
        if (connected) setRestoring(false);
      },
      expired: (message, status) => {
        if (gameRef.current || status === 404) setError(message);
        gameRef.current = null;
        setGame(null);
        setRestoring(false);
        updateDossier({ type: 'reset' });
        setPrivateResult(null);
        setInvestigationOpen(false);
        setChoice(null);
        localStorage.removeItem('sh-room');
        if (status === 404) history.replaceState(null, '', '/');
      },
    });
    connection.current = live;
    return () => {
      live.stop();
      if (connection.current === live) connection.current = null;
    };
  }, [accept]);

  useEffect(() => {
    // Keep this breakpoint aligned with .desktop-chat-layout in game.css.
    const media = window.matchMedia('(min-width: 1280px)');
    const changed = () => {
      desktopChatRef.current = media.matches;
      setDesktopChat(media.matches);
      if (media.matches) {
        chatOpenRef.current = false;
        setChatOpen(false);
        if (chatTabRef.current === 'chat')
          setLastReadMessage(gameRef.current?.messages.at(-1)?.id ?? '');
      }
    };
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    const changed = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError(
        'Fullscreen is unavailable here. The table still fits your screen.',
      );
    }
  };

  useEffect(() => {
    const hide = () => updateDossier({ type: 'hide' });
    const resume = () => {
      if (!document.hidden && document.hasFocus())
        updateDossier({ type: 'resume' });
    };
    const visibility = () => (document.hidden ? hide() : resume());
    window.addEventListener('blur', hide);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!roleOpen || dossier.pending) return;
    const timeout = setTimeout(() => updateDossier({ type: 'expire' }), 30_000);
    return () => clearTimeout(timeout);
  }, [roleOpen, dossier.pending]);

  const latestMessage = game?.messages.at(-1);
  useEffect(() => {
    if (!latestMessage || latestMessage.id === lastSpoken.current) return;
    lastSpoken.current = latestMessage.id;
    if (
      !readAloud ||
      !voiceAvailable ||
      document.hidden ||
      !gameRef.current?.players.some(
        (p) => p.id === latestMessage.playerId && p.bot,
      )
    )
      return;
    const utterance = new SpeechSynthesisUtterance(
      `${latestMessage.name}. ${latestMessage.text}`,
    );
    // Finish the current sentence rather than interrupting it at fast AI pace.
    if (window.speechSynthesis.speaking) return;
    const voices = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.startsWith('en'));
    const seat = gameRef.current.players.findIndex(
      (p) => p.id === latestMessage.playerId,
    );
    if (voices.length) utterance.voice = voices[seat % voices.length];
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  }, [latestMessage, readAloud, voiceAvailable]);
  useEffect(() => {
    if (!voiceAvailable) return;
    const quiet = () => {
      if (document.hidden) window.speechSynthesis.cancel();
    };
    document.addEventListener('visibilitychange', quiet);
    return () => {
      document.removeEventListener('visibilitychange', quiet);
      window.speechSynthesis.cancel();
    };
  }, [voiceAvailable]);

  async function socketRequest(input: Record<string, unknown>) {
    const live = connection.current;
    if (!live)
      throw new Error('Connecting to the table. Please try again shortly.');
    return live.request(input);
  }
  async function enter(operation: 'create' | 'join' | 'solo') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await socketRequest({
        operation,
        name,
        portrait,
        ...(operation === 'solo' ? { seats: Number(seats) } : {}),
        code: code.replace(/[\s-]/g, '').toUpperCase(),
      });
      if ('left' in next) throw new Error('Could not enter the table.');
      accept(next);
      localStorage.setItem('sh-name', name.trim());
      const actualPortrait = next.players.find(
        (p) => p.id === next.me.id,
      )!.portrait;
      setPortrait(actualPortrait);
      localStorage.setItem('sh-portrait', String(actualPortrait));
      localStorage.setItem('sh-room', next.code);
      history.replaceState(null, '', `?room=${next.code}`);
      setSeatOpen(false);
      if (operation === 'solo') {
        setCoaching(true);
        localStorage.setItem('sh-coach', 'true');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function choose(details: {
    action: Action;
    title: string;
    description: string;
  }) {
    const current = gameRef.current;
    if (current)
      setChoice({ ...details, phase: current.phase, round: current.round });
  }
  async function act(
    action: Action,
    expected?: { phase: GameView['phase']; round: number },
  ): Promise<boolean> {
    const current = gameRef.current;
    if (!current || pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await socketRequest({
        operation: 'action',
        code: current.code,
        phase: expected?.phase ?? current.phase,
        round: expected?.round ?? current.round,
        action,
      });
      if (gameRef.current?.code !== current.code) return false;
      if ('left' in next) clear();
      else {
        accept(next);
        if (['nominate', 'power', 'rematch', 'start'].includes(action.type))
          setSeatOpen(false);
        if (action.type === 'portrait') {
          setPortrait(action.portrait);
          localStorage.setItem('sh-portrait', String(action.portrait));
        }
      }
      setChoice(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      connection.current?.sync();
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function invite() {
    if (!game) return;
    const url = `${location.origin}/?room=${game.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(`Invite link: ${url}`);
    }
  }
  async function stepBots() {
    const current = gameRef.current;
    if (!current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await socketRequest({
        operation: 'tick',
        code: current.code,
        manual: true,
        revision: current.revision,
      });
      if (!('left' in next) && gameRef.current?.code === current.code)
        accept(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const me = game?.players.find((p) => p.id === game.me.id);
  const inGame = game && game.phase !== 'lobby';
  const lastElection = game ? electionResult(game) : null;
  const lastPolicy = game ? policyResult(game) : null;
  const investigatedPlayer = game?.players.find(
    (player) => player.id === privateResult?.targetId,
  );
  const unreadChat =
    (!(chatOpen || desktopChat) || chatTab !== 'chat') && game
      ? game.messages
          .slice(game.messages.findIndex((m) => m.id === lastReadMessage) + 1)
          .filter((m) => m.playerId !== game.me.id).length
      : 0;
  const leave = () => {
    if (!game) return;
    choose({
      action: { type: 'leave' },
      title: 'Leave this table?',
      description: ['lobby', 'finished'].includes(game.phase)
        ? 'Your seat will be freed. If you host, another human player becomes host.'
        : 'Your seat stays reserved until this match ends. The game may wait for your turn. Rejoin with this room’s link and the same browser to return; hosting passes to another player.',
    });
  };

  return (
    <div
      className={`app-shell ${game ? 'in-room' : 'main-menu'} ${feedback.motion ? 'motion-on' : 'motion-off'}`}
    >
      <header className="masthead">
        <div className="brand">
          <img
            src={asset('logo-transparent')}
            alt="Secret Hitler"
            width="70"
            height="49"
          />
          <span>
            THE ONLINE TABLE<small>5–10 PLAYERS</small>
          </span>
        </div>
        <nav className="header-actions" aria-label="Game controls">
          <span className="table-status">
            <span className={`status-dot ${!online ? 'offline' : ''}`} />
            {game ? (online ? 'Connected' : 'Reconnecting') : '5–10 players'}
          </span>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label={
              feedback.sound ? 'Mute game sounds' : 'Enable game sounds'
            }
            aria-pressed={feedback.sound}
            title={feedback.sound ? 'Mute game sounds' : 'Enable game sounds'}
            onClick={() => void feedback.toggleSound()}
          >
            {feedback.sound ? <Volume2 /> : <VolumeX />}
          </Button>
          {canFullscreen && (
            <Button
              variant="ghost"
              className="icon-button"
              aria-label={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={() => void toggleFullscreen()}
            >
              {fullScreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          )}
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setRules(true)}
          >
            <BookOpen />
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="Game settings"
            title="Game settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </nav>
      </header>

      <main
        className={`workspace ${game ? `has-room ${game.phase}` : 'start-screen'} ${game && desktopChat ? 'desktop-chat-layout' : ''} ${seatOpen ? 'seat-open' : ''}`}
      >
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              {game
                ? `ROOM ${game.code.slice(0, 4)} ${game.code.slice(4)} · ${game.players.length}/10`
                : 'A GAME OF HIDDEN LOYALTIES'}
            </p>
            <h1>
              {game
                ? game.phase === 'lobby'
                  ? 'Waiting lobby'
                  : game.phase === 'finished'
                    ? 'Match complete'
                    : `Round ${game.round}`
                : 'Take a seat. Trust no one.'}
            </h1>
          </div>
          {game ? (
            <div className="room-actions">
              <Button
                variant="outline"
                className="invite-button"
                onClick={() => setSeatOpen(true)}
                aria-expanded={seatOpen}
                aria-haspopup="dialog"
              >
                <Users /> Your seat
              </Button>
              <Button
                className="invite-button"
                variant="outline"
                onClick={invite}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Invite'}
              </Button>
              <Button
                variant="outline"
                className="invite-button"
                onClick={() => setPrivacy(true)}
              >
                <ShieldCheck /> Fair play
              </Button>
              <Button
                variant="outline"
                className="invite-button"
                onClick={leave}
                disabled={busy}
              >
                <ArrowLeft /> Leave
              </Button>
            </div>
          ) : (
            <span className="edition-mark">
              EST. 1932
              <br />
              <span>LIBERTY HANGS IN THE BALANCE</span>
            </span>
          )}
        </div>
        {error && (
          <TransientNotice
            key={error}
            message={error}
            onDismiss={dismissNotice}
          />
        )}
        {!online && game && (
          <output className="notice">
            <WifiOff />
            <span>
              Connection interrupted. Reconnecting automatically; your seat is
              saved.
            </span>
          </output>
        )}

        {!game && (
          <section className="start-intro" aria-label="Secret Hitler">
            <img
              className="menu-logo"
              src={asset('logo-transparent')}
              alt="Secret Hitler"
              width="420"
              height="293"
            />
            <p className="intro-line">The original game of hidden loyalties.</p>
            <div className="intro-meta">
              <span>
                <Users size={16} />
                5–10 players
              </span>
              <span>
                <Bot size={16} />
                Friends + AI
              </span>
            </div>
            <Button
              variant="outline"
              className="learn-button"
              onClick={() => setRules(true)}
            >
              <BookOpen size={18} />
              Learn the rules
            </Button>
          </section>
        )}
        {inGame && (
          <section
            className={`chamber ${isYourTurn(game) ? 'your-turn' : ''}`}
            aria-label="Game table"
          >
            <div className="chamber-bar">
              <span>
                <span className="status-dot" />
                {phaseNames[game.phase]}
              </span>
              <span className={isYourTurn(game) ? 'turn-tag' : ''}>
                {isYourTurn(game)
                  ? 'YOUR TURN'
                  : `ROUND ${String(game.round).padStart(2, '0')}`}
              </span>
            </div>
            {inGame && (
              <div className="turn-action">
                {lastPolicy &&
                  (lastPolicy.round === game.round ||
                    (game.phase === 'nomination' &&
                      lastPolicy.round === game.round - 1)) && (
                    <PolicyRecap
                      key={lastPolicy.id}
                      result={lastPolicy}
                      fresh={feedback.policy?.id === lastPolicy.id}
                    />
                  )}
                {lastElection && game.phase !== 'voting' && (
                  <ElectionRecap
                    key={lastElection.id}
                    result={lastElection}
                    fresh={feedback.election?.id === lastElection.id}
                  />
                )}
                {privateResult && (
                  <section
                    className="floor-private-result"
                    aria-label="Your private result"
                  >
                    <div>
                      <p className="eyebrow">
                        <Eye size={14} /> PRIVATE TO YOU
                      </p>
                      {privateResult.party && investigatedPlayer ? (
                        <>
                          <p>Investigation complete.</p>
                          <Button
                            variant="outline"
                            className="investigation-review"
                            onClick={() => setInvestigationOpen(true)}
                          >
                            <Eye size={16} /> Review private result
                          </Button>
                        </>
                      ) : (
                        <p>{privateResult.text}</p>
                      )}
                      {privateResult.policies && (
                        <div className="peek-policies">
                          {privateResult.policies.map((policy, index) => (
                            <span className={policy} key={index}>
                              {index + 1}.{' '}
                              {policy === 'liberal' ? 'Liberal' : 'Fascist'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Dismiss private result"
                      onClick={() => setPrivateResult(null)}
                    >
                      <X size={16} />
                    </Button>
                  </section>
                )}
                <ActionPanel
                  key={`${game.code}-${game.fairness?.id}-${game.me.id}-${game.round}-${game.phase}-${game.president}-${game.chancellor}-${game.power}`}
                  game={game}
                  busy={busy || !online}
                  act={act}
                />
                {coaching && (
                  <details className="coach-peek">
                    <summary>
                      <BookOpen size={14} />
                      Coach · {coachTip(game).title}
                    </summary>
                    <CoachCard game={game} />
                  </details>
                )}
              </div>
            )}
            <div className="board-surface">
              <PolicyBoard
                kind="liberal"
                highlightedCount={
                  feedback.policy?.kind === 'liberal'
                    ? feedback.policy.count
                    : undefined
                }
                count={game?.liberal ?? 0}
                tracker={game?.tracker ?? 0}
                players={
                  game?.initialCount || Math.max(game?.players.length ?? 5, 5)
                }
              />
              <PolicyBoard
                kind="fascist"
                highlightedCount={
                  feedback.policy?.kind === 'fascist'
                    ? feedback.policy.count
                    : undefined
                }
                count={game?.fascist ?? 0}
                players={
                  game?.initialCount || Math.max(game?.players.length ?? 5, 5)
                }
              />
              <div className="deck-tracker">
                <div className="deck-count">
                  <FileText size={20} />
                  <span>
                    <b>{inGame ? game.drawCount : 17}</b> draw
                    <span className="muted">
                      {' '}
                      / {game?.discardCount ?? 0} discarded
                    </span>
                  </span>
                </div>
                <div className="election-tracker">
                  <span>ELECTION TRACKER</span>
                  <div className="tracker-steps">
                    {[0, 1, 2, 3].map((n) => (
                      <span
                        key={n}
                        title={
                          n === 3
                            ? 'Chaos: enact the top policy'
                            : `${n} failed governments`
                        }
                        className={`tracker-dot ${n === (game?.tracker ?? 0) ? 'current' : ''}`}
                      >
                        {n === 3 ? <Flag size={12} /> : n}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {feedback.cue &&
              feedback.cue.kind !== 'election' &&
              !(feedback.cue.kind === 'policy' && feedback.policy) && (
                <output
                  className={`table-cue ${feedback.cue.party ?? ''} cue-${feedback.cue.kind}`}
                  key={feedback.cue.id}
                >
                  <span className="cue-rule" />
                  <b>{feedback.cue.title}</b>
                  <span>{feedback.cue.detail}</span>
                </output>
              )}
          </section>
        )}

        {(!game || game.phase === 'lobby') && (
          <aside
            className="side-panel"
            aria-label={game ? 'Your seat' : 'Create or join a table'}
          >
            {!game ? (
              <div className="entry-card paper">
                <div className="paper-top">
                  <span>YOUR INVITATION</span>
                  <LockKeyhole size={17} />
                </div>
                <h2>Take your seat</h2>
                <p>Invite your friends. Fill the empty seats with AI.</p>
                <Tabs
                  value={entry}
                  onValueChange={(v) =>
                    setEntry(v as 'create' | 'join' | 'solo')
                  }
                >
                  <TabsList className="entry-tabs">
                    <TabsTrigger value="create">Create</TabsTrigger>
                    <TabsTrigger value="join">Join</TabsTrigger>
                    <TabsTrigger value="solo">
                      <Bot size={16} /> Play solo
                    </TabsTrigger>
                  </TabsList>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void enter(entry);
                    }}
                  >
                    <label className="field-label" htmlFor="display-name">
                      YOUR DISPLAY NAME
                    </label>
                    <input
                      id="display-name"
                      autoComplete="off"
                      minLength={2}
                      maxLength={24}
                      placeholder="What should we call you?"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    {entry === 'join' && (
                      <>
                        <label className="field-label" htmlFor="room-code">
                          ROOM CODE
                        </label>
                        <input
                          id="room-code"
                          className="code-input"
                          autoCapitalize="characters"
                          autoComplete="off"
                          spellCheck={false}
                          minLength={8}
                          maxLength={9}
                          placeholder="ABCD EFGH"
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.toUpperCase())
                          }
                          required
                        />
                      </>
                    )}
                    {entry === 'solo' && (
                      <div className="solo-options">
                        <label
                          className="field-label"
                          id="solo-size-label"
                          htmlFor="solo-size"
                        >
                          TABLE SIZE
                        </label>
                        <Select
                          value={seats}
                          onValueChange={(v) => {
                            if (v) setSeats(v);
                          }}
                        >
                          <SelectTrigger
                            id="solo-size"
                            aria-labelledby="solo-size-label"
                            className="solo-size"
                          >
                            <SelectValue>
                              {seats} players · you + {Number(seats) - 1} AI
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {[5, 6, 7, 8, 9, 10].map((n) => (
                              <SelectItem key={n} value={String(n)}>
                                {n} players · you + {n - 1} AI
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p>
                          Original rules, secret roles, and a coach you can turn
                          off. Five players is a good first table.
                        </p>
                      </div>
                    )}
                    <PortraitPicker
                      value={portrait}
                      onChange={setPortrait}
                      disabled={busy || restoring || !online}
                    />
                    <Button
                      className="primary-button"
                      type="submit"
                      disabled={busy || restoring || !online}
                    >
                      {busy
                        ? 'Taking your seat…'
                        : restoring || !online
                          ? 'Checking your seat…'
                          : entry === 'create'
                            ? 'Create private table'
                            : entry === 'solo'
                              ? 'Deal me in with AI'
                              : 'Join the table'}
                      {!busy && <ArrowRight size={18} />}
                    </Button>
                  </form>
                </Tabs>
                <div className="entry-note">
                  <LockKeyhole size={14} />
                  <span>
                    {entry === 'solo'
                      ? 'No waiting for other players. Your seat reconnects on refresh.'
                      : entry === 'create'
                        ? 'Invite friends and add AI to any empty seat, up to 10 players.'
                        : 'Use the code or link your host shared with you.'}
                  </span>
                </div>
                <div className="entry-specs">
                  <span>
                    <Users size={16} /> 5–10 players
                  </span>
                  <span>45 min</span>
                  <span>Ages 13+</span>
                </div>
                <div className="new-player">
                  <BookOpen size={22} />
                  <div>
                    <b>First time at the table?</b>
                    <button onClick={() => setRules(true)}>
                      Read the field guide <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="seat-card paper">
                  <div className="paper-top">
                    <span>
                      YOUR SEAT ·{' '}
                      {String(
                        game.players.findIndex((p) => p.id === game.me.id) + 1,
                      ).padStart(2, '0')}
                    </span>
                    {game.hostId === game.me.id ? (
                      <Crown size={18} />
                    ) : (
                      <LockKeyhole size={18} />
                    )}
                  </div>
                  <div className="seat-identity">
                    <img
                      src={portraitUrl(me?.portrait ?? portrait)}
                      width="64"
                      height="64"
                      alt="Your chosen portrait"
                    />
                    <h2>{me?.name}</h2>
                  </div>
                  {game.phase === 'lobby' ? (
                    <>
                      <p>
                        {game.players.length < 5
                          ? `${5 - game.players.length} more ${game.players.length === 4 ? 'player' : 'players'} needed to begin.`
                          : `${game.players.filter((p) => p.ready).length} of ${game.players.length} players ready.`}
                      </p>
                      <details className="change-portrait">
                        <summary>Change your picture</summary>
                        <PortraitPicker
                          value={me?.portrait ?? portrait}
                          onChange={(value) =>
                            void act({ type: 'portrait', portrait: value })
                          }
                          disabled={busy}
                        />
                      </details>
                      <Button
                        className={`primary-button ${me?.ready ? 'ready-button' : ''}`}
                        disabled={busy}
                        onClick={() => act({ type: 'ready' })}
                      >
                        {me?.ready ? <CheckCheck /> : <Check />}
                        {me?.ready ? 'Ready — click to unready' : 'I’m ready'}
                      </Button>
                      {game.hostId === game.me.id &&
                        game.players.length < 10 && (
                          <Button
                            variant="ghost"
                            className="fill-bots-button"
                            disabled={busy}
                            onClick={() => act({ type: 'fill-bots' })}
                          >
                            Fill all empty seats with AI · 10 players
                          </Button>
                        )}
                      {game.hostId === game.me.id && (
                        <Button
                          className="start-button"
                          disabled={
                            busy ||
                            game.players.length < 5 ||
                            !game.players.every((p) => p.ready)
                          }
                          onClick={() => act({ type: 'start' })}
                        >
                          Deal the roles <ArrowRight />
                        </Button>
                      )}
                      {game.hostId === game.me.id && (
                        <details className="lobby-player-management">
                          <summary>Manage players</summary>
                          {game.players
                            .filter((p) => p.id !== game.me.id)
                            .map((p) => (
                              <div key={p.id}>
                                <img
                                  src={portraitUrl(p.portrait)}
                                  width="32"
                                  height="32"
                                  alt=""
                                />
                                <span>
                                  {p.name}
                                  {p.bot ? ' · AI' : ''}
                                </span>
                                <Button
                                  variant="outline"
                                  disabled={busy || !online}
                                  onClick={() =>
                                    choose({
                                      action: { type: 'kick', target: p.id },
                                      title: `Remove ${p.name}?`,
                                      description:
                                        'They will leave this waiting table.',
                                    })
                                  }
                                  aria-label={`Remove ${p.name}`}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          <Button
                            variant="outline"
                            className="add-bot-button"
                            disabled={
                              busy || !online || game.players.length >= 10
                            }
                            onClick={() => act({ type: 'add-bot' })}
                          >
                            <Bot />{' '}
                            {game.players.length >= 10
                              ? 'Table full · 10 players'
                              : 'Add an AI'}
                          </Button>
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        {!me?.alive && game.phase !== 'finished'
                          ? 'You were executed. Watch silently until the game ends.'
                          : 'Your allegiance is yours to keep.'}
                      </p>
                      <Button
                        variant="outline"
                        className="role-button"
                        onClick={() => updateDossier({ type: 'open' })}
                      >
                        <Eye /> View secret dossier <LockKeyhole size={15} />
                      </Button>
                      <div className="seat-assignment">
                        {game.president === game.me.id ? (
                          <>
                            <Crown /> President
                          </>
                        ) : game.chancellor === game.me.id ? (
                          <>
                            <Flag /> Chancellor
                          </>
                        ) : (
                          <>
                            <Users />{' '}
                            {me?.alive ? 'Member of the chamber' : 'Eliminated'}
                          </>
                        )}
                      </div>
                      {game.phase === 'finished' && (
                        <div className="next-match-controls">
                          {game.hostId === game.me.id ? (
                            <Button
                              className="start-button"
                              disabled={busy}
                              onClick={() => act({ type: 'rematch' })}
                            >
                              Open lobby <ArrowRight />
                            </Button>
                          ) : (
                            <p>
                              The host can reopen the lobby for another match.
                            </p>
                          )}
                          <p>
                            Add friends or AI, change seats, then deal again.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <div className="seat-utility-actions">
                    <Button variant="outline" onClick={invite}>
                      <Copy /> Invite friends
                    </Button>
                    <Button variant="outline" onClick={leave} disabled={busy}>
                      <ArrowLeft /> Leave table
                    </Button>
                  </div>
                </div>
              </>
            )}
          </aside>
        )}

        {game && (
          <section className="players-panel paper" aria-label="Players">
            <div className="players-heading">
              <h2>
                The assembly <span>{game.players.length}/10</span>
              </h2>
              <span>
                {game.phase === 'lobby'
                  ? `${game.players.filter((p) => p.ready).length} READY`
                  : `${game.players.filter((p) => p.alive).length} IN PLAY${feedback.election && game.phase !== 'voting' ? ` · ROUND ${feedback.election.round} VOTES` : ''}`}
              </span>
            </div>
            <div
              className="players-grid"
              key={`${game.code}-${game.initialCount}`}
            >
              {game.players.map((p, i) => {
                const knowledge = playerKnowledge(game, p.id);
                const office = playerOffice(game, p.id);
                return (
                  <div
                    key={p.id}
                    className={`player ${!p.alive ? 'eliminated' : ''} ${office ? `${office.kind}-player` : ''}`}
                    style={{ animationDelay: `${i * 45}ms` }}
                    title={`${p.name}${office ? ` · ${office.label}${game.phase === 'voting' ? ' nominee' : ''}` : ''}${knowledge ? ` · ${knowledge.label}` : ''}`}
                  >
                    {inGame && (
                      <PlayerEvent
                        playerId={p.id}
                        phase={game.phase}
                        vote={game.ballots[p.id] ?? null}
                        election={feedback.election}
                        policy={feedback.policy}
                      />
                    )}
                    <div className="player-number">
                      <img
                        className="player-portrait"
                        src={portraitUrl(p.portrait)}
                        width="48"
                        height="48"
                        alt=""
                      />
                      <span className="seat-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`status-dot ${p.connected ? '' : 'offline'}`}
                        title={
                          p.connected
                            ? 'Connected'
                            : 'Disconnected — seat saved'
                        }
                      />
                      {office?.kind === 'president' ? (
                        <Crown className="player-office-icon" />
                      ) : office?.kind === 'chancellor' ? (
                        <Flag className="player-office-icon" />
                      ) : null}
                    </div>
                    <div className="player-info">
                      <b>
                        {p.name}{' '}
                        {p.id === game.me.id && (
                          <span className="you-label">YOU</span>
                        )}
                        {p.bot && (
                          <span className="bot-badge">
                            <Bot size={12} /> AI
                          </span>
                        )}
                      </b>
                      {office && (
                        <span
                          className="office-label"
                          aria-label={office.label}
                        >
                          <span className="office-full">{office.label}</span>
                          <span className="office-short" aria-hidden="true">
                            {office.shortLabel}
                          </span>
                        </span>
                      )}
                      {knowledge && (
                        <strong
                          className={`known-role ${knowledge.kind}`}
                          aria-label={`${knowledge.source === 'party' ? 'Private investigation' : 'Role you know'}: ${knowledge.label}`}
                        >
                          {knowledge.label}
                        </strong>
                      )}
                      {(!office ||
                        p.departed ||
                        (game.phase === 'voting' &&
                          game.voted.includes(p.id))) && (
                        <span>
                          {game.phase === 'finished'
                            ? p.alive
                              ? 'Survived'
                              : 'Executed'
                            : p.departed
                              ? 'Away · seat reserved'
                              : !p.alive
                                ? 'Executed'
                                : game.phase === 'lobby'
                                  ? p.ready
                                    ? 'Ready to play'
                                    : 'Getting settled'
                                  : game.phase === 'voting' &&
                                      game.voted.includes(p.id)
                                    ? 'Voted'
                                    : game.eligible.includes(p.id)
                                      ? 'Eligible for chancellor'
                                      : p.id === game.lastChancellor ||
                                          (game.players.filter((p) => p.alive)
                                            .length > 5 &&
                                            p.id === game.lastPresident)
                                        ? 'Term-limited'
                                        : 'In the chamber'}
                        </span>
                      )}
                    </div>
                    {!p.alive ? (
                      <Skull className="player-icon" />
                    ) : game.phase === 'lobby' && p.ready ? (
                      <Check className="player-icon" />
                    ) : null}
                  </div>
                );
              })}
              {Array.from(
                { length: Math.max(0, 5 - game.players.length) },
                (_, i) => (
                  <div className="empty-seat" key={i}>
                    <Plus size={20} />
                    <span>Empty seat</span>
                  </div>
                ),
              )}
            </div>
          </section>
        )}
        {game && desktopChat && (
          <aside className="desktop-chat paper" aria-label="Table conversation">
            <div className="desktop-chat-heading">
              <h2>Table conversation</h2>
              <MessageCircle size={17} aria-hidden="true" />
            </div>
            <Conversation
              game={game}
              act={act}
              busy={busy || !online}
              message={chatDraft}
              setMessage={setChatDraft}
              tab={chatTab}
              setTab={changeChatTab}
              unread={unreadChat}
            />
          </aside>
        )}
      </main>

      {game && !desktopChat && (
        <Popover open={chatOpen} onOpenChange={changeChatOpen} modal={false}>
          <PopoverTrigger render={<Button className="chat-launcher" />}>
            <MessageCircle /> Chat{' '}
            {unreadChat > 0 && (
              <span
                className="chat-unread"
                aria-label={`${unreadChat} unread messages`}
              >
                {unreadChat > 99 ? '99+' : unreadChat}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            className="chat-popover paper"
            side="top"
            align="start"
            sideOffset={10}
          >
            <div className="chat-popover-heading">
              <PopoverTitle>Table conversation</PopoverTitle>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close chat"
                onClick={() => changeChatOpen(false)}
              >
                <X />
              </Button>
            </div>
            <Conversation
              game={game}
              act={act}
              busy={busy || !online}
              message={chatDraft}
              setMessage={setChatDraft}
              tab={chatTab}
              setTab={changeChatTab}
              unread={unreadChat}
            />
          </PopoverContent>
        </Popover>
      )}

      {game && (
        <div className="game-dock">
          <span className="dock-status">
            {game.phase === 'lobby'
              ? 'WAITING FOR THE DEAL'
              : game.phase === 'finished'
                ? 'MATCH COMPLETE'
                : `${game.drawCount} IN DECK · ${game.discardCount} DISCARDED`}
          </span>
          <Button
            variant="ghost"
            className="dock-button"
            onClick={() => setSettingsOpen(true)}
          >
            <BookOpen size={16} />
            <span>Coach & AI</span>
            {game.practice?.paused && <Pause size={14} />}
          </Button>
        </div>
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="guide-dialog paper settings-dialog">
          <DialogHeader>
            <p className="eyebrow">YOUR EXPERIENCE</p>
            <DialogTitle>Game settings</DialogTitle>
            <DialogDescription>Settle into the table.</DialogDescription>
          </DialogHeader>
          <div className="settings-row">
            <span>
              <Volume2 size={18} />
              Game sounds
              <small>Soft cues for deals, votes, and policies.</small>
            </span>
            <Switch
              aria-label="Game sounds"
              checked={feedback.sound}
              onCheckedChange={() => void feedback.toggleSound()}
            />
          </div>
          <div className="settings-row">
            <span>
              <Sparkles size={18} />
              Animations
              <small>
                Your device’s reduced-motion preference is also respected.
              </small>
            </span>
            <Switch
              aria-label="Game animations"
              checked={feedback.motion}
              onCheckedChange={feedback.setMotion}
            />
          </div>
          {game && (
            <div className="learning-tools">
              {' '}
              <div className="learning-toolbar">
                <label className="coach-toggle" htmlFor="coach-switch">
                  <BookOpen size={17} /> Coach
                  <Switch
                    id="coach-switch"
                    aria-label="Show learning coach"
                    checked={coaching}
                    onCheckedChange={(value) => {
                      setCoaching(value);
                      localStorage.setItem('sh-coach', String(value));
                    }}
                  />
                </label>
                {game.practice && (
                  <span className="ai-table-label">
                    <Bot size={17} /> {game.players.filter((p) => p.bot).length}{' '}
                    AI players
                  </span>
                )}
                {game.practice && voiceAvailable && (
                  <label className="coach-toggle" htmlFor="voice-switch">
                    Read AI aloud{' '}
                    <Switch
                      id="voice-switch"
                      aria-label="Read AI dialogue aloud"
                      checked={readAloud}
                      onCheckedChange={(value) => {
                        setReadAloud(value);
                        if (!value) window.speechSynthesis.cancel();
                      }}
                    />
                  </label>
                )}
                {game.practice &&
                  game.hostId === game.me.id &&
                  !['lobby', 'finished'].includes(game.phase) && (
                    <div className="ai-controls">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !online}
                        onClick={() =>
                          act({
                            type: 'practice-settings',
                            paused: !game.practice!.paused,
                          })
                        }
                      >
                        {game.practice.paused ? <Play /> : <Pause />}
                        {game.practice.paused ? 'Resume AI' : 'Pause AI'}
                      </Button>
                      {game.practice.paused && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || !online}
                          onClick={stepBots}
                        >
                          <StepForward /> One step
                        </Button>
                      )}
                      <Select
                        value={game.practice.pace}
                        onValueChange={(v) => {
                          if (v === 'normal' || v === 'fast')
                            void act({ type: 'practice-settings', pace: v });
                        }}
                        disabled={busy || !online}
                      >
                        <SelectTrigger aria-label="AI pace" className="ai-pace">
                          <SelectValue>
                            {game.practice.pace === 'fast'
                              ? 'Fast pace'
                              : 'Normal pace'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal pace</SelectItem>
                          <SelectItem value="fast">Fast pace</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
              </div>
              {coaching && <CoachCard game={game} />}
              {game.practice?.paused && game.phase !== 'finished' && (
                <p className="ai-paused-note">
                  AI paused. Human turns are still available. The host can
                  resume or advance one AI step.
                </p>
              )}
              {game.practice && game.messages.length > 0 && (
                <div className="table-talk-preview">
                  <MessageCircle size={17} />
                  <p>
                    <b>{game.messages.at(-1)!.name}:</b>{' '}
                    {game.messages.at(-1)!.text}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSettingsOpen(false);
                      changeChatOpen(true);
                    }}
                  >
                    Chat <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="settings-links">
            <Button
              variant="outline"
              onClick={() => {
                setSettingsOpen(false);
                setRules(true);
              }}
            >
              <BookOpen />
              How to play
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSettingsOpen(false);
                setPrivacy(true);
              }}
            >
              <ShieldCheck />
              Fair play & credits
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={seatOpen} onOpenChange={setSeatOpen}>
        <DialogContent className="paper seat-dialog">
          <DialogHeader>
            <p className="eyebrow">YOUR PLACE AT THE TABLE</p>
            <DialogTitle>{me?.name ?? 'Your seat'}</DialogTitle>
            <DialogDescription>
              {game?.phase === 'lobby'
                ? 'Choose your portrait before the deal.'
                : 'Your identity and private information.'}
            </DialogDescription>
          </DialogHeader>
          {game && (
            <>
              <div className="seat-profile">
                <img
                  src={portraitUrl(me?.portrait ?? 1)}
                  alt="Your portrait"
                  width="96"
                  height="96"
                />
                <div>
                  <b>
                    Seat{' '}
                    {game.players.findIndex((p) => p.id === game.me.id) + 1}
                  </b>
                  <span>
                    {game.hostId === game.me.id
                      ? 'Table host'
                      : 'Member of the chamber'}
                  </span>
                  {game.me.role && (
                    <strong className={`known-role ${game.me.role}`}>
                      {game.me.role === 'hitler'
                        ? 'Hitler'
                        : game.me.role === 'liberal'
                          ? 'Liberal'
                          : 'Fascist'}
                    </strong>
                  )}
                </div>
              </div>
              {game.phase === 'lobby' ? (
                <PortraitPicker
                  value={me?.portrait ?? 1}
                  onChange={(value) =>
                    void act({ type: 'portrait', portrait: value })
                  }
                  disabled={busy || !online}
                />
              ) : (
                <Button
                  className="primary-button"
                  onClick={() => {
                    setSeatOpen(false);
                    updateDossier({ type: 'open' });
                  }}
                >
                  <Eye />
                  Open secret dossier
                </Button>
              )}
              <div className="settings-links">
                <Button variant="outline" onClick={invite}>
                  <Copy />
                  Invite friends
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSeatOpen(false);
                    leave();
                  }}
                >
                  <ArrowLeft />
                  Leave table
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <footer className="footer">
        <span>
          Based on{' '}
          <a
            href="https://www.secrethitler.com/"
            target="_blank"
            rel="noreferrer"
          >
            Secret Hitler
          </a>{' '}
          by Mike Boxleiter, Tommy Maranges & Mac Schubert.
        </span>
        <span>
          Unofficial · Noncommercial ·{' '}
          <a
            href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-NC-SA 4.0
          </a>
          <button onClick={() => setPrivacy(true)}>Fair play & credits</button>
        </span>
      </footer>

      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent
          ref={fieldGuideRef}
          className="guide-dialog paper"
          initialFocus={() => {
            const guide = fieldGuideRef.current;
            // Focusing the first FAQ scrolls past the introduction on small screens.
            if (guide) guide.scrollTop = 0;
            return guide;
          }}
        >
          <DialogHeader>
            <p className="eyebrow">THE FIELD GUIDE</p>
            <DialogTitle>Know the rules. Question everyone.</DialogTitle>
            <DialogDescription>
              The standard game for 5–10 players. No house rules.
            </DialogDescription>
          </DialogHeader>
          <div className="guide-content">
            <div className="win-conditions">
              <div>
                <b>LIBERALS WIN</b>
                <p>Enact 5 liberal policies, or execute Hitler.</p>
              </div>
              <div>
                <b>FASCISTS WIN</b>
                <p>
                  Enact 6 fascist policies, or elect Hitler chancellor after 3
                  fascist policies.
                </p>
              </div>
            </div>
            <ol className="rule-steps">
              <li>
                <b>Read your secret role.</b> Liberals know only their own role.
                Fascists know their teammates and Hitler. Hitler knows the
                Fascist only in 5–6 player games.
              </li>
              <li>
                <b>Form a government.</b> The president nominates an eligible
                chancellor. Everyone votes Ja or Nein. A strict majority passes;
                a tie fails. Votes appear as each player submits them.
              </li>
              <li>
                <b>Pass a policy.</b> The president draws 3 policies and
                discards 1. The chancellor enacts 1 of the remaining 2. The
                government stays silent during this process. Afterward, anyone
                can lie about what they saw.
              </li>
              <li>
                <b>Exercise a power.</b> Some fascist policies grant a mandatory
                presidential power. The power track depends on the original
                player count.
              </li>
              <li>
                <b>Pass the presidency.</b> Move to the next living player. The
                last elected government is ineligible for chancellor; with 5 or
                fewer players alive, only the last chancellor is barred.
              </li>
            </ol>
            <details>
              <summary>
                Election tracker & veto <ChevronDown size={16} />
              </summary>
              <p>
                Three failed governments enact the top policy automatically,
                without its executive power. This clears term limits. Enacting
                any policy resets the tracker; an election passing does not.
                After 5 fascist policies, the chancellor can request a veto.
                Both leaders must agree. An accepted veto discards the remaining
                hand and advances the election tracker. A refused veto forces a
                policy choice.
              </p>
            </details>
            <details>
              <summary>
                Executive powers <ChevronDown size={16} />
              </summary>
              <p>
                <b>Investigation:</b> privately learn a player’s party, not
                their exact role. Nobody may be investigated twice.{' '}
                <b>Policy peek:</b> see the next 3 policies without changing
                their order. <b>Special election:</b> choose another president
                for one election; then resume from the player after the
                president who called it. <b>Execution:</b> eliminate another
                player. Only Hitler’s death reveals a role. Eliminated players
                cannot vote, hold office, or speak.
              </p>
            </details>
            <details>
              <summary>
                Role distribution & policy deck <ChevronDown size={16} />
              </summary>
              <p>
                The deck contains 6 liberal and 11 fascist policies. With
                5/6/7/8/9/10 players there are 3/4/4/5/5/6 Liberals, 1/1/2/2/3/3
                ordinary Fascists, and always 1 Hitler. When fewer than 3
                policies remain after legislation, the remaining draw and
                discard piles are shuffled together.
              </p>
            </details>
            <a
              className="rulebook-link"
              href="https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={17} /> Read the complete official rulebook{' '}
              <ArrowRight size={16} />
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={privacy} onOpenChange={setPrivacy}>
        <DialogContent className="guide-dialog paper">
          <DialogHeader>
            <p className="eyebrow">A FAIR TABLE</p>
            <DialogTitle>Keep your secrets. Play honestly.</DialogTitle>
            <DialogDescription>
              How this online adaptation protects the game.
            </DialogDescription>
          </DialogHeader>
          <div className="guide-content">
            <FairPlayProof
              key={game?.fairness?.id ?? 'no-proof'}
              proof={game?.fairness ?? null}
            />
            <p>
              Roles, shuffling, policies, ballots, and legal moves are
              controlled by the server. Your device receives only your own
              permitted private information. Submitted votes are public; the
              election finishes after everyone votes. Simultaneous moves cannot
              overwrite each other.
            </p>
            <p>
              Your seat uses a private browser cookie. Return using the same
              browser to reconnect. No email or account is required. Rooms close
              after everyone disconnects, with a one-minute grace period for
              reconnecting. Sessions expire after 7 days without activity and
              are cleaned up as new tables are created.
            </p>
            <p>
              Invite people you trust. Software cannot prevent friends from
              sharing screenshots, using a second device, or talking outside the
              game. Keep one seat per person and respect the silence required
              during legislation and after execution. This version provides
              table text chat; use your own group call if desired.
            </p>
            <p>
              Hosts can add AI players to any waiting table, up to 10 total
              seats. AI players use the same legal moves and private information
              as human players. They use game strategy and 300 authored dialogue
              lines, so they can bluff but do not hold unrestricted
              conversations. The coach explains rules; AI claims are not
              verified facts. Optional read-aloud uses your browser’s available
              voices.
            </p>
            <hr />
            <h3>Game & artwork credits</h3>
            <p>
              Secret Hitler by Mike Boxleiter, Tommy Maranges, and Mac Schubert.
              Original game and artwork © Goat, Wolf & Cabbage. Board, policy,
              role, and ballot artwork comes from{' '}
              <a
                href="https://github.com/ShrimpCryptid/Secret-Hitler-Online"
                target="_blank"
                rel="noreferrer"
              >
                Secret Hitler Online by ShrimpCryptid
              </a>
              , whose adapted PNGs are used with their original colors and
              borders. The logo and supporting illustrations come from the
              official game.
            </p>
            <p>
              The {PORTRAITS.length} selectable player avatars are original
              cartoon characters created for this app using AI image generation,
              inspired by the original game’s printed character art. The set has{' '}
              {
                PORTRAITS.filter((portrait) => portrait.category === 'men')
                  .length
              }{' '}
              men,{' '}
              {
                PORTRAITS.filter((portrait) => portrait.category === 'women')
                  .length
              }{' '}
              women, and{' '}
              {
                PORTRAITS.filter((portrait) => portrait.category === 'animals')
                  .length
              }{' '}
              animal characters, all with transparent backgrounds. Avatars are
              cosmetic and independent of secret roles.
            </p>
            <p>
              The responsive interface, networking, and rule enforcement are
              new. This adaptation is unaffiliated with the original creators
              and is released under{' '}
              <a
                href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-NC-SA 4.0
              </a>
              , for noncommercial use.
            </p>
            <p>
              Typography and colors draw on the{' '}
              <a
                href="https://www.secrethitler.com/"
                target="_blank"
                rel="noreferrer"
              >
                official Secret Hitler website
              </a>
              . Courier Prime and Jost are used under the SIL Open Font License.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roleOpen || dossier.pending}
        onOpenChange={(open) =>
          updateDossier({ type: open ? 'open' : 'dismiss' })
        }
      >
        <DialogContent className="dossier-dialog paper">
          <DialogHeader>
            <p className="eyebrow">FOR YOUR EYES ONLY</p>
            <DialogTitle>Your secret dossier</DialogTitle>
            <DialogDescription>
              {dossier.pending
                ? 'Read your role, then close your dossier when you are ready. It stays available if you switch away.'
                : 'Automatically hidden when you switch away, or after 30 seconds.'}
            </DialogDescription>
          </DialogHeader>
          {roleOpen && game?.me.role && (
            <div className="dossier-content">
              <img
                className="role-image"
                src={asset(`role-${game.me.role}`)}
                alt={`Your secret role is ${game.me.role}`}
                width="500"
                height="713"
              />
              <div>
                <h3>
                  You are{' '}
                  {game.me.role === 'hitler'
                    ? 'Hitler'
                    : `a ${game.me.role === 'liberal' ? 'Liberal' : 'Fascist'}`}
                  .
                </h3>
                <p>
                  {game.me.role === 'liberal'
                    ? 'Protect the republic. Enact five liberal policies or find and execute Hitler.'
                    : game.me.role === 'hitler'
                      ? 'Stay hidden. Get elected chancellor after three fascist policies, or help enact six.'
                      : 'Protect Hitler. Enact six fascist policies or elect Hitler chancellor after three.'}
                </p>
                {game.me.teammates.length > 0 && (
                  <div className="private-notes">
                    <b>Your allies</b>
                    {game.me.teammates.map((p) => (
                      <p key={p.id}>
                        {p.name} —{' '}
                        <strong>
                          {p.role === 'hitler' ? 'Hitler' : 'Fascist'}
                        </strong>
                      </p>
                    ))}
                  </div>
                )}
                {game.me.notes.map((note, i) => (
                  <div key={i} className="private-notes">
                    <p>{note.text}</p>
                    {note.party && note.targetId && (
                      <Button
                        variant="outline"
                        className="investigation-review"
                        onClick={() => {
                          updateDossier({ type: 'dismiss' });
                          setPrivateResult(note);
                          setInvestigationOpen(true);
                        }}
                      >
                        <Eye size={16} /> Review investigation
                      </Button>
                    )}
                    {note.policies && (
                      <div className="peek-policies">
                        {note.policies.map((p, j) => (
                          <span key={j} className={p}>
                            {j + 1}. {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!roleOpen && (
            <p>
              Your private information is hidden while this window is inactive.
            </p>
          )}
          <Button
            className="primary-button"
            onClick={() => updateDossier({ type: 'dismiss' })}
          >
            <EyeOff />{' '}
            {dossier.pending ? 'Got it · close dossier' : 'Close dossier'}
          </Button>
        </DialogContent>
      </Dialog>

      {game && privateResult?.party && investigatedPlayer && (
        <InvestigationDialog
          open={investigationOpen}
          onOpenChange={setInvestigationOpen}
          player={investigatedPlayer}
          party={privateResult.party}
        />
      )}

      <Dialog
        open={!!choice}
        onOpenChange={(open) => {
          if (!open) setChoice(null);
        }}
      >
        <DialogContent className="paper confirm-dialog">
          <DialogHeader>
            <DialogTitle>{choice?.title}</DialogTitle>
            <DialogDescription>{choice?.description}</DialogDescription>
          </DialogHeader>
          <div className="confirm-actions">
            <Button variant="outline" onClick={() => setChoice(null)}>
              Cancel
            </Button>
            <Button
              className="confirm-button"
              disabled={busy}
              onClick={() => choice && act(choice.action, choice)}
            >
              {busy ? 'Confirming…' : 'Confirm choice'}
              <Check size={16} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CoachCard({ game }: { game: View }) {
  const tip = coachTip(game);
  return (
    <section className="coach-card" aria-label="Learning coach">
      <span className="coach-icon">
        <BookOpen size={20} />
      </span>
      <div>
        <h3>{tip.title}</h3>
        <p>{tip.text}</p>
        <span className="coach-footnote">
          Coach explains the rules. Player chat can contain bluffs.
        </span>
      </div>
    </section>
  );
}

function PlayerActionPicker({
  game,
  selection,
  busy,
  submit,
}: {
  game: View;
  selection: NonNullable<ReturnType<typeof playerSelection>>;
  busy: boolean;
  submit: (action: Action) => Promise<boolean>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selection.options.find(
    (option) => option.player.id === selectedId && !option.disabledReason,
  );
  const verb =
    selection.kind === 'nominate'
      ? 'Nominate'
      : selection.kind === 'investigate'
        ? 'Investigate'
        : selection.kind === 'execute'
          ? 'Execute'
          : 'Appoint president';
  const detail =
    selection.kind === 'nominate'
      ? 'The whole table will vote on this government.'
      : selection.kind === 'investigate'
        ? 'Only you learn their party membership. Hitler appears as a Fascist.'
        : selection.kind === 'execute'
          ? 'This eliminates the player. Executing Hitler wins for the Liberals.'
          : 'They lead the next election. Normal presidential rotation resumes afterward.';
  return (
    <div className="floor-player-picker">
      <fieldset
        className="floor-player-options"
        aria-label="Choose a player for this action"
      >
        {selection.options.map(({ player, seat, disabledReason }) => {
          const knowledge = playerKnowledge(game, player.id);
          return (
            <button
              key={player.id}
              type="button"
              className={`floor-player-option ${selected?.player.id === player.id ? 'selected' : ''}`}
              disabled={busy || !!disabledReason}
              aria-pressed={selected?.player.id === player.id}
              aria-label={`${player.name}${disabledReason ? `: ${disabledReason}` : ''}`}
              onClick={() => setSelectedId(player.id)}
            >
              <img
                src={portraitUrl(player.portrait)}
                width="36"
                height="36"
                alt=""
              />
              <span className="floor-player-info">
                <b>{player.name}</b>
                <small>
                  Seat {seat}
                  {player.bot ? ' · AI' : ''}
                </small>
                {disabledReason ? (
                  <small>{disabledReason}</small>
                ) : (
                  knowledge && (
                    <span className={`known-role ${knowledge.kind}`}>
                      {knowledge.label}
                    </span>
                  )
                )}
              </span>
              {selected?.player.id === player.id && (
                <Check
                  className="floor-selected-check"
                  size={14}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </fieldset>
      <div className="floor-confirmation">
        <div>
          <p>
            {selected ? (
              <>
                <b>{selected.player.name}</b> selected.
              </>
            ) : (
              'Choose a player to continue.'
            )}
          </p>
          {selected && <p className="floor-action-detail">{detail}</p>}
        </div>
        <Button
          className={`action-button ${selection.kind === 'execute' ? 'danger-action' : ''}`}
          disabled={busy || !selected}
          onClick={() =>
            selected &&
            submit({
              type: selection.kind === 'nominate' ? 'nominate' : 'power',
              target: selected.player.id,
            })
          }
        >
          <Check size={16} /> {busy ? 'Confirming…' : `Confirm · ${verb}`}
        </Button>
      </div>
    </div>
  );
}

function ActionPanel({
  game,
  busy,
  act,
}: {
  game: View;
  busy: boolean;
  act: (
    action: Action,
    expected?: { phase: GameView['phase']; round: number },
  ) => Promise<boolean>;
}) {
  const [policyIndex, setPolicyIndex] = useState<number | null>(null);
  const selection = playerSelection(game);
  const submit = (action: Action) =>
    act(action, { phase: game.phase, round: game.round });
  const me = game.players.find((p) => p.id === game.me.id)!;
  const president = game.players.find((p) => p.id === game.president);
  const chancellor = game.players.find((p) => p.id === game.chancellor);
  const isPresident = game.president === me.id;
  const isChancellor = game.chancellor === me.id;
  const legislation = legislativeGuidance(game);
  let title = '';
  let description = '';
  if (game.phase === 'finished') {
    title = `${game.winner === 'liberal' ? 'The Liberals' : 'The Fascists'} win.`;
    description = game.winReason!;
  } else if (!me.alive) {
    title = 'Your time in the chamber is over.';
    description =
      'Watch the game silently. All roles will be revealed at the end.';
  } else if (game.phase === 'nomination') {
    title = isPresident
      ? 'President, choose your chancellor.'
      : `${president?.name} is choosing a chancellor.`;
    description = isPresident
      ? 'Select a player below, then confirm your nomination.'
      : 'Discuss who you trust while the president considers the next government.';
  } else if (game.phase === 'voting') {
    title = `${president?.name} + ${chancellor?.name}`;
    description =
      game.me.ballot === null
        ? 'Do you trust this government? Cast your ballot.'
        : 'Your vote is submitted. Waiting for the rest of the chamber.';
  } else if (legislation) {
    title = legislation.title;
    description = legislation.description;
  } else if (game.phase === 'executive') {
    title = `${isPresident ? 'Your power' : `${president?.name}’s power`}: ${powerNames[game.power!]}`;
    description = isPresident
      ? game.power === 'peek'
        ? 'Privately inspect the next three policies. Your result will appear here.'
        : 'Select a player below, then confirm your power.'
      : 'The president must exercise this power before the next election.';
  }
  return (
    <div
      className={`action-panel ${isYourTurn(game) ? 'active-turn' : ''} ${game.phase === 'finished' ? `victory ${game.winner}` : ''}`}
      aria-live="polite"
    >
      <p className="eyebrow">
        {game.phase === 'finished'
          ? 'THE REPUBLIC HAS DECIDED'
          : game.phase === 'voting'
            ? `VOTE FOR THIS GOVERNMENT · ${game.voted.length}/${game.players.filter((p) => p.alive).length} VOTED`
            : 'ON THE FLOOR'}
      </p>
      {game.phase === 'finished' && <Flag className="victory-mark" size={28} />}
      {game.phase === 'voting' && me.alive ? (
        <h2 className="government-candidates">
          <span className="government-candidate president-office">
            <span className="office-caption">
              <Crown size={14} /> President
            </span>
            {president?.name}
          </span>
          <span className="government-candidate chancellor-office">
            <span className="office-caption">
              <Flag size={14} /> Chancellor
            </span>
            {chancellor?.name}
          </span>
        </h2>
      ) : (
        <h2>{title}</h2>
      )}
      <p>{description}</p>
      {selection && (
        <PlayerActionPicker
          game={game}
          selection={selection}
          busy={busy}
          submit={submit}
        />
      )}
      {game.phase === 'voting' && me.alive && (
        <div className="ballots">
          <button
            className={`ballot ja ${game.me.ballot === true ? 'selected' : ''}`}
            disabled={busy || game.me.ballot !== null}
            onClick={() => submit({ type: 'vote', yes: true })}
            aria-label="Vote Ja, yes"
          >
            <img
              src={asset('ballot-ja')}
              alt="Ja! Yes"
              width="730"
              height="539"
            />
            {game.me.ballot === true && (
              <span>
                <Check /> VOTED
              </span>
            )}
          </button>
          <button
            className={`ballot nein ${game.me.ballot === false ? 'selected' : ''}`}
            disabled={busy || game.me.ballot !== null}
            onClick={() => submit({ type: 'vote', yes: false })}
            aria-label="Vote Nein, no"
          >
            <img
              src={asset('ballot-nein')}
              alt="Nein! No"
              width="730"
              height="539"
            />
            {game.me.ballot === false && (
              <span>
                <Check /> VOTED
              </span>
            )}
          </button>
        </div>
      )}
      {game.me.hand.length > 0 && game.phase !== 'veto-response' && (
        <div className="policy-choices">
          {game.me.hand.map((p, i) => (
            <button
              key={`${game.round}-${game.phase}-${i}`}
              style={{ animationDelay: `${i * 90}ms` }}
              aria-label={`${game.phase === 'president-discard' ? 'Discard' : 'Enact'} ${p} policy ${i + 1}`}
              className={`policy-choice ${p} ${policyIndex === i ? 'selected' : ''}`}
              disabled={busy}
              aria-pressed={policyIndex === i}
              onClick={() => setPolicyIndex(i)}
            >
              <PolicyCard kind={p} index={i} />
              <span>
                {game.phase === 'president-discard' ? 'Discard' : 'Enact'}
              </span>
            </button>
          ))}
        </div>
      )}
      {game.me.hand.length > 0 && game.phase !== 'veto-response' && (
        <div className="floor-confirmation">
          <p>
            {policyIndex === null
              ? 'Select a policy to continue.'
              : `${game.me.hand[policyIndex] === 'liberal' ? 'Liberal' : 'Fascist'} policy selected.`}
          </p>
          <Button
            className="action-button"
            disabled={
              busy || policyIndex === null || !game.me.hand[policyIndex]
            }
            onClick={() =>
              policyIndex !== null &&
              submit({
                type: game.phase === 'president-discard' ? 'discard' : 'enact',
                index: policyIndex,
              })
            }
          >
            <Check size={16} />
            {busy
              ? 'Confirming…'
              : game.phase === 'president-discard'
                ? 'Confirm discard'
                : 'Confirm enactment'}
          </Button>
        </div>
      )}
      {game.phase === 'chancellor-enact' &&
        isChancellor &&
        game.fascist >= 5 &&
        !game.vetoDenied && (
          <Button
            className="action-button"
            variant="outline"
            disabled={busy}
            onClick={() => submit({ type: 'veto' })}
          >
            Request a veto
          </Button>
        )}
      {game.phase === 'veto-response' && isPresident && (
        <div className="veto-actions">
          <Button
            disabled={busy}
            onClick={() => submit({ type: 'veto-answer', yes: true })}
          >
            Agree to veto
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => submit({ type: 'veto-answer', yes: false })}
          >
            Refuse veto
          </Button>
        </div>
      )}
      {game.phase === 'executive' && isPresident && game.power === 'peek' && (
        <Button
          className="action-button"
          disabled={busy}
          onClick={() => submit({ type: 'power' })}
        >
          <Eye /> Inspect policies
        </Button>
      )}
      {game.phase === 'finished' && me.id === game.hostId && (
        <Button
          className="action-button"
          disabled={busy}
          onClick={() => submit({ type: 'rematch' })}
        >
          Open lobby · change players & rematch <ArrowRight />
        </Button>
      )}
      {game.phase === 'finished' && (
        <p className="next-match-note">
          {me.id === game.hostId
            ? 'Invite more friends or add AI in the lobby, up to 10 players.'
            : 'Waiting for the host to open the next lobby. You can leave from the top bar.'}
        </p>
      )}
    </div>
  );
}

function TransientNotice({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (hovered || focused) return;
    const timer = window.setTimeout(onDismiss, 8_000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, hovered, focused]);
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Hover and focus only pause the notice timer; dismissal remains a button.
    <div
      className="notice error"
      role="alert"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <HelpCircle />
      <span>{message}</span>
      <button aria-label="Dismiss notice" onClick={onDismiss}>
        <X size={18} />
      </button>
    </div>
  );
}

function Conversation({
  game,
  act,
  busy,
  message,
  setMessage,
  tab,
  setTab,
  unread,
}: {
  game: View;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
  message: string;
  setMessage: (value: string) => void;
  tab: string;
  setTab: (value: string) => void;
  unread: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const me = game.players.find((p) => p.id === game.me.id)!;
  const muted =
    (!me.alive && game.phase !== 'finished') ||
    (['president-discard', 'chancellor-enact', 'veto-response'].includes(
      game.phase,
    ) &&
      [game.president, game.chancellor].includes(me.id));
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [game.messages.length, tab]);
  return (
    <div className="conversation paper">
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="conversation-tabs">
          <TabsTrigger value="chat">
            <MessageCircle /> Table talk
            {unread > 0 && (
              <span
                className="chat-unread"
                aria-label={`${unread} unread messages`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="log">
            <FileText /> Game log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <div
            className="chat-scroll"
            ref={scrollRef}
            role="log"
            aria-label="Table chat"
          >
            {game.messages.length ? (
              game.messages.map((m) => (
                <div
                  key={m.id}
                  className={`chat-message ${m.playerId === game.me.id ? 'own-message' : ''}`}
                >
                  <div>
                    <b>
                      {m.name}{' '}
                      {game.players.some(
                        (p) => p.id === m.playerId && p.bot,
                      ) && (
                        <span className="bot-badge">
                          <Bot size={12} /> AI
                        </span>
                      )}
                    </b>
                    <time>
                      {new Date(m.time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))
            ) : (
              <div className="chat-empty">
                <MessageCircle size={28} />
                <p>Every word is a clue.</p>
                <span>Make your case. Question theirs.</span>
              </div>
            )}
          </div>
          <form
            className="chat-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await act({ type: 'chat', text: message })) setMessage('');
            }}
          >
            <input
              aria-label="Message the table"
              placeholder={
                muted ? 'You must remain silent…' : 'Address the chamber…'
              }
              value={message}
              maxLength={400}
              onChange={(e) => setMessage(e.target.value)}
              disabled={muted}
            />
            <Button
              size="icon"
              type="submit"
              aria-label="Send message"
              disabled={busy || muted || !message.trim()}
            >
              <Send size={17} />
            </Button>
          </form>
          {muted && (
            <p className="muted-notice">
              {!me.alive
                ? 'Executed players cannot speak.'
                : 'The government stays silent during legislation.'}
            </p>
          )}
        </TabsContent>
        <TabsContent value="log">
          <div
            className="log-scroll"
            role="log"
            aria-label="Public game history"
          >
            {game.log.length ? (
              [...game.log].reverse().map((item) => (
                <div className="log-entry" key={item.id}>
                  <span>{String(item.round).padStart(2, '0')}</span>
                  <p>
                    {item.text}
                    {item.policy?.source === 'government' &&
                      item.policy.chancellor && (
                        <small className="log-government">
                          Enacted by {item.policy.chancellor.name} · President:{' '}
                          {item.policy.president?.name ?? 'Unknown'}
                        </small>
                      )}
                  </p>
                </div>
              ))
            ) : (
              <div className="chat-empty">
                <FileText size={28} />
                <p>A history yet to be written.</p>
                <span>The public record begins when roles are dealt.</span>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
