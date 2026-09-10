'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { coachTip } from '@/lib/coach';
import type { Action, GameView, Policy, Power } from '@/lib/game';

type View = Omit<GameView, 'players'> & {
  players: (GameView['players'][number] & { connected: boolean })[];
};
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
// Refresh cached print-and-play exports when loading the full-color source pack.
const asset = (name: string) => `/assets/${name}.png?v=6b210bae`;

async function api(input?: Record<string, unknown>, code?: string) {
  const response = await fetch(
    `/api/table${code ? `?code=${encodeURIComponent(code)}` : ''}`,
    {
      method: input ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      ...(input
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          }
        : {}),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const result = (await response.json()) as View & {
    left?: boolean;
    error?: string;
  };
  if (!response.ok)
    throw Object.assign(
      new Error(result.error ?? 'The table could not be reached.'),
      { status: response.status },
    );
  return result as View & { left?: boolean };
}

export default function GameTable() {
  const [game, setGame] = useState<View | null>(null);
  const [name, setName] = useState('');
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
  const [online, setOnline] = useState(true);
  const [rules, setRules] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('table');
  const [choice, setChoice] = useState<{
    action: Action;
    title: string;
    description: string;
    phase: GameView['phase'];
    round: number;
  } | null>(null);
  const gameRef = useRef<View | null>(null);
  const pending = useRef(false);
  const accept = useCallback((next: View) => {
    const current = gameRef.current;
    if (current?.code === next.code && current.revision > next.revision) return;
    gameRef.current = next;
    setGame(next);
    setOnline(true);
  }, []);
  const clear = () => {
    gameRef.current = null;
    setGame(null);
    localStorage.removeItem('sh-room');
    history.replaceState(null, '', '/');
    setRoleOpen(false);
    setReadAloud(false);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  useEffect(() => {
    // Browser storage is read after hydration; it is unavailable during server rendering.
    // oxlint-disable-next-line react/react-compiler
    setName(localStorage.getItem('sh-name') ?? '');
    setCoaching(localStorage.getItem('sh-coach') === 'true');
    setVoiceAvailable('speechSynthesis' in window);
    const invite = new URLSearchParams(location.search)
      .get('room')
      ?.toUpperCase();
    const saved = invite ?? localStorage.getItem('sh-room');
    if (invite) {
      setCode(invite);
      setEntry('join');
    }
    let active = true;
    if (saved) {
      api(undefined, saved)
        .then((next) => {
          if (active) {
            accept(next);
            localStorage.setItem('sh-room', saved);
          }
        })
        .catch((e: Error & { status?: number }) => {
          if (e.status === 404 || e.status === 401 || e.status === 400)
            localStorage.removeItem('sh-room');
          else if (active)
            setError(
              'Could not reconnect yet. Enter your room code to try again.',
            );
        })
        .finally(() => {
          if (active) setRestoring(false);
        });
    } else setRestoring(false);
    return () => {
      active = false;
    };
  }, [accept]);

  useEffect(() => {
    if (!game?.code) return;
    const room = game.code;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!document.hidden) {
          const current = gameRef.current;
          const wakeBots =
            current?.practice &&
            !current.practice.paused &&
            !['lobby', 'finished'].includes(current.phase) &&
            !pending.current;
          const next = wakeBots
            ? await api({ operation: 'tick', code: room })
            : await api(undefined, room);
          if (active && gameRef.current?.code === room) accept(next);
        }
      } catch (e) {
        if (active) {
          setOnline(false);
          const status = (e as { status?: number }).status;
          if (status === 400 || status === 401 || status === 404) {
            setError((e as Error).message);
            gameRef.current = null;
            setGame(null);
            localStorage.removeItem('sh-room');
            return;
          }
        }
      }
      if (active)
        timer = setTimeout(
          poll,
          gameRef.current?.practice?.pace === 'fast' ? 750 : 1500,
        );
    };
    timer = setTimeout(poll, 1500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [game?.code, accept]);

  useEffect(() => {
    if (!roleOpen) return;
    const hide = () => setRoleOpen(false);
    const timeout = setTimeout(hide, 30_000);
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [roleOpen]);

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

  async function enter(operation: 'create' | 'join' | 'solo') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await api({
        operation,
        name,
        ...(operation === 'solo' ? { seats: Number(seats) } : {}),
        code: code.replace(/[\s-]/g, '').toUpperCase(),
      });
      accept(next);
      localStorage.setItem('sh-name', name.trim());
      localStorage.setItem('sh-room', next.code);
      history.replaceState(null, '', `?room=${next.code}`);
      setMobilePanel('table');
      if (operation === 'solo') {
        setCoaching(true);
        localStorage.setItem('sh-coach', 'true');
        setRoleOpen(true);
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
      const next = await api({
        operation: 'action',
        code: current.code,
        requestId: crypto.randomUUID(),
        phase: expected?.phase ?? current.phase,
        round: expected?.round ?? current.round,
        action,
      });
      if (next.left) clear();
      else {
        accept(next);
        if (next.me.notes.length > current.me.notes.length) setRoleOpen(true);
      }
      setChoice(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      try {
        accept(await api(undefined, current.code));
      } catch {
        setOnline(false);
      }
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
      accept(
        await api({
          operation: 'tick',
          code: current.code,
          manual: true,
          revision: current.revision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const me = game?.players.find((p) => p.id === game.me.id);
  const inGame = game && game.phase !== 'lobby';

  return (
    <div className="app-shell">
      <header className="masthead">
        <Link className="brand" href="/" aria-label="Secret Hitler home">
          <img
            src={asset('logo-transparent')}
            alt="Secret Hitler"
            width="114"
            height="80"
          />
          <span>
            THE ONLINE TABLE
            <span className="edition">AN UNOFFICIAL ADAPTATION</span>
          </span>
        </Link>
        <nav className="header-actions" aria-label="Help">
          <span className="table-status">
            <span className={`status-dot ${!online ? 'offline' : ''}`} />
            {game
              ? online
                ? 'Table connected'
                : 'Reconnecting…'
              : '5–10 players'}
          </span>
          <Button
            variant="ghost"
            className="header-button"
            onClick={() => setRules(true)}
          >
            <BookOpen />
            <span>How to play</span>
          </Button>
          <Button
            variant="ghost"
            className="icon-button"
            aria-label="Fair play and privacy"
            onClick={() => setPrivacy(true)}
          >
            <ShieldCheck />
          </Button>
        </nav>
      </header>

      <main
        className={`workspace ${game ? `has-room ${game.phase}` : 'start-screen'} mobile-${mobilePanel}`}
      >
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              {game
                ? `PRIVATE TABLE / ${game.code.slice(0, 4)} ${game.code.slice(4)}`
                : 'A GAME OF HIDDEN LOYALTIES'}
            </p>
            <h1>
              {game
                ? game.phase === 'lobby'
                  ? 'Gather your conspirators.'
                  : 'The chamber is in session.'
                : 'Take a seat. Trust no one.'}
            </h1>
          </div>
          {game ? (
            <Button
              className="invite-button"
              variant="outline"
              onClick={invite}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? 'Link copied' : 'Invite friends'}
            </Button>
          ) : (
            <span className="edition-mark">
              EST. 1932
              <br />
              <span>LIBERTY HANGS IN THE BALANCE</span>
            </span>
          )}
        </div>
        {error && (
          <div className="notice error" role="alert">
            <HelpCircle />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={18} />
            </button>
          </div>
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

        <section className="chamber" aria-label="Game table">
          <div className="chamber-bar">
            <span>
              <span className="status-dot" />
              {game ? phaseNames[game.phase] : 'THE CHAMBER'}
            </span>
            <span>
              {inGame
                ? `ROUND ${String(game.round).padStart(2, '0')}`
                : 'ORIGINAL RULES · 5–10 PLAYERS'}
            </span>
          </div>
          {game && (
            <div className="learning-tools">
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
                    onClick={() => setMobilePanel('chat')}
                  >
                    Chat <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
          {inGame && (
            <div className="mobile-action">
              <ActionPanel
                game={game}
                busy={busy || !online}
                act={act}
                choose={choose}
              />
            </div>
          )}
          <div className="board-surface">
            {!inGame && (
              <div className="table-invitation">
                <span className="fine-line" />
                <span>Two parties. One secret.</span>
                <span className="fine-line" />
              </div>
            )}
            <PolicyBoard
              kind="liberal"
              count={game?.liberal ?? 0}
              players={
                game?.initialCount || Math.max(game?.players.length ?? 5, 5)
              }
            />
            <div className="board-divider">
              <span />{' '}
              <span className="vs-label">THE FATE OF THE REPUBLIC</span>{' '}
              <span />
            </div>
            <PolicyBoard
              kind="fascist"
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
            {!inGame && (
              <div className="sealed-envelopes" aria-hidden="true">
                <div className="sealed-card one">
                  <LockKeyhole />
                  <span>SECRET ROLE</span>
                </div>
                <div className="sealed-card two">
                  <LockKeyhole />
                  <span>SECRET ROLE</span>
                </div>
                <p>
                  Your allegiances are sealed.
                  <br />
                  <span>Keep your friends close.</span>
                </p>
              </div>
            )}
          </div>
          {inGame ? (
            <div className="desktop-action">
              <ActionPanel
                game={game}
                busy={busy || !online}
                act={act}
                choose={choose}
              />
            </div>
          ) : (
            <div className="chamber-foot">
              <ShieldCheck size={17} />
              <span>Secret roles. Sealed ballots. The original game.</span>
              <button onClick={() => setRules(true)}>
                Know the rules <ArrowRight size={15} />
              </button>
            </div>
          )}
        </section>

        <aside
          className="side-panel"
          aria-label={
            game ? 'Your seat and table conversation' : 'Create or join a table'
          }
        >
          {!game ? (
            <div className="entry-card paper">
              <div className="paper-top">
                <span>YOUR INVITATION</span>
                <LockKeyhole size={17} />
              </div>
              <h2>The table awaits.</h2>
              <p>
                Play with friends, AI opponents, or a mix of both. Learn the
                game on your own, too.
              </p>
              <Tabs
                value={entry}
                onValueChange={(v) => setEntry(v as 'create' | 'join' | 'solo')}
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
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
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
                  <Button
                    className="primary-button"
                    type="submit"
                    disabled={busy || restoring}
                  >
                    {busy
                      ? 'Taking your seat…'
                      : restoring
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
                <h2>{me?.name}</h2>
                {game.phase === 'lobby' ? (
                  <>
                    <p>
                      {game.players.length < 5
                        ? `${5 - game.players.length} more ${game.players.length === 4 ? 'player' : 'players'} needed to begin.`
                        : 'Everyone is here. Ready when you are.'}
                    </p>
                    <Button
                      className={`primary-button ${me?.ready ? 'ready-button' : ''}`}
                      disabled={busy}
                      onClick={() => act({ type: 'ready' })}
                    >
                      {me?.ready ? <CheckCheck /> : <Check />}
                      {me?.ready ? 'Ready — click to unready' : 'I’m ready'}
                    </Button>
                    {game.hostId === game.me.id && (
                      <Button
                        variant="outline"
                        className="add-bot-button"
                        disabled={busy || game.players.length >= 10}
                        onClick={() => act({ type: 'add-bot' })}
                      >
                        <Bot />{' '}
                        {game.players.length >= 10
                          ? 'Table full · 10 players'
                          : 'Add AI player'}
                      </Button>
                    )}
                    {game.hostId === game.me.id && game.players.length < 10 && (
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
                    <button
                      className="text-button leave-button"
                      onClick={() => act({ type: 'leave' })}
                      disabled={busy}
                    >
                      <ArrowLeft size={14} /> Leave table
                    </button>
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
                      onClick={() => setRoleOpen(true)}
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
                  </>
                )}
              </div>
              <Conversation game={game} act={act} busy={busy} />
            </>
          )}
          {!game && (
            <div className="official-art">
              <img
                src={asset('official-box-art')}
                alt="Secret Hitler's original illustrated game box"
                width="2560"
                height="1323"
              />
              <span>THE ORIGINAL GAME. A SHARED TABLE.</span>
            </div>
          )}
        </aside>

        {game && (
          <section className="players-panel paper" aria-label="Players">
            <div className="players-heading">
              <h2>
                The assembly <span>{game.players.length}/10</span>
              </h2>
              <span>
                {game.phase === 'lobby'
                  ? `${game.players.filter((p) => p.ready).length} READY`
                  : `${game.players.filter((p) => p.alive).length} IN PLAY`}
              </span>
            </div>
            <div className="players-grid">
              {game.players.map((p, i) => {
                const eligible =
                  game.phase === 'nomination' &&
                  game.president === game.me.id &&
                  game.eligible.includes(p.id);
                const targetPower =
                  game.phase === 'executive' &&
                  game.president === game.me.id &&
                  game.power !== 'peek' &&
                  p.alive &&
                  p.id !== game.me.id &&
                  !(
                    game.power === 'investigate' &&
                    game.investigated.includes(p.id)
                  );
                return (
                  <div
                    key={p.id}
                    className={`player ${!p.alive ? 'eliminated' : ''} ${p.id === game.president ? 'president-player' : ''}`}
                  >
                    <div className="player-number">
                      {String(i + 1).padStart(2, '0')}
                      <span
                        className={`status-dot ${p.connected ? '' : 'offline'}`}
                        title={
                          p.connected
                            ? 'Connected'
                            : 'Disconnected — seat saved'
                        }
                      />
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
                      <span>
                        {game.phase === 'finished'
                          ? p.role
                          : !p.alive
                            ? 'Executed'
                            : p.id === game.president
                              ? 'President'
                              : p.id === game.chancellor
                                ? 'Chancellor'
                                : game.phase === 'lobby'
                                  ? p.ready
                                    ? 'Ready to play'
                                    : 'Getting settled'
                                  : game.phase === 'voting' &&
                                      game.voted.includes(p.id)
                                    ? 'Ballot sealed'
                                    : game.eligible.includes(p.id)
                                      ? 'Eligible for chancellor'
                                      : p.id === game.lastChancellor ||
                                          (game.players.filter((p) => p.alive)
                                            .length > 5 &&
                                            p.id === game.lastPresident)
                                        ? 'Term-limited'
                                        : 'In the chamber'}
                      </span>
                    </div>
                    {eligible || targetPower ? (
                      <Button
                        className="nominate-button"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          choose({
                            action: eligible
                              ? { type: 'nominate', target: p.id }
                              : { type: 'power', target: p.id },
                            title: eligible
                              ? `Nominate ${p.name}?`
                              : `${powerNames[game.power!]}: ${p.name}`,
                            description: eligible
                              ? 'The whole chamber will vote on this government.'
                              : game.power === 'execute'
                                ? 'This removes them from the game. If they are Hitler, the Liberals win immediately.'
                                : game.power === 'investigate'
                                  ? 'Only you will learn their party membership. Hitler appears as a Fascist.'
                                  : 'They will lead a special election. Normal rotation resumes afterward.',
                          })
                        }
                      >
                        {eligible ? 'Nominate' : 'Choose'}
                        <ArrowRight size={14} />
                      </Button>
                    ) : p.id === game.president ? (
                      <Crown className="player-icon" />
                    ) : !p.alive ? (
                      <Skull className="player-icon" />
                    ) : game.phase === 'lobby' && p.ready ? (
                      <Check className="player-icon" />
                    ) : null}
                    {game.phase === 'lobby' &&
                      game.hostId === game.me.id &&
                      p.id !== game.me.id && (
                        <button
                          className="kick-button"
                          aria-label={`Remove ${p.name}`}
                          onClick={() =>
                            choose({
                              action: { type: 'kick', target: p.id },
                              title: `Remove ${p.name}?`,
                              description:
                                'They will leave this waiting table.',
                            })
                          }
                        >
                          <X size={14} />
                        </button>
                      )}
                  </div>
                );
              })}
              {Array.from(
                { length: Math.max(0, 5 - game.players.length) },
                (_, i) => (
                  <button className="empty-seat" key={i} onClick={invite}>
                    <Plus size={20} />
                    <span>Invite a friend</span>
                  </button>
                ),
              )}
            </div>
          </section>
        )}
      </main>

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

      {game && (
        <nav className="mobile-nav" aria-label="Table sections">
          {[
            { id: 'table', icon: <Flag />, text: 'Table' },
            { id: 'players', icon: <Users />, text: 'Players' },
            { id: 'chat', icon: <MessageCircle />, text: 'Chat & role' },
          ].map((item) => (
            <button
              key={item.id}
              aria-current={mobilePanel === item.id ? 'page' : undefined}
              onClick={() => setMobilePanel(item.id)}
            >
              {item.icon}
              {item.text}
            </button>
          ))}
        </nav>
      )}

      <Dialog open={rules} onOpenChange={setRules}>
        <DialogContent className="guide-dialog paper">
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
                a tie fails. Ballots reveal together.
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
            <p>
              Roles, shuffling, policies, ballots, and legal moves are
              controlled by the server. Your device receives only your own
              permitted private information. Votes stay sealed until everyone
              has voted; simultaneous moves cannot overwrite each other.
            </p>
            <p>
              Your seat uses a private browser cookie. Return using the same
              browser to reconnect. No email or account is required. Room state,
              chat, and sessions expire after 7 days without activity and are
              cleaned up as new tables are created.
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
            <h3>Original game & artwork</h3>
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
              official game. The responsive interface, networking, and rule
              enforcement are new. This adaptation is unaffiliated with the
              original creators and is released under{' '}
              <a
                href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY-NC-SA 4.0
              </a>
              , for noncommercial use.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="dossier-dialog paper">
          <DialogHeader>
            <p className="eyebrow">FOR YOUR EYES ONLY</p>
            <DialogTitle>Your secret dossier</DialogTitle>
            <DialogDescription>
              Automatically hidden when you switch away, or after 30 seconds.
            </DialogDescription>
          </DialogHeader>
          {roleOpen && game?.me.role && (
            <div className="dossier-content">
              <img
                className={`role-image ${game.me.role}`}
                src={asset(`role-${game.me.role}`)}
                alt={`Your secret role is ${game.me.role}`}
                width="500"
                height={game.me.role === 'fascist' ? 713 : 712}
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
          <Button className="primary-button" onClick={() => setRoleOpen(false)}>
            <EyeOff /> Close dossier
          </Button>
        </DialogContent>
      </Dialog>

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

function PolicyBoard({
  kind,
  count,
  players,
}: {
  kind: Policy;
  count: number;
  players: number;
}) {
  const liberal = kind === 'liberal';
  const total = liberal ? 5 : 6;
  const powers: (Power | null)[] =
    players <= 6
      ? [null, null, 'peek', 'execute', 'execute', null]
      : players <= 8
        ? [null, 'investigate', 'special-election', 'execute', 'execute', null]
        : [
            'investigate',
            'investigate',
            'special-election',
            'execute',
            'execute',
            null,
          ];
  return (
    <div className={`policy-section ${kind}`}>
      <div className="policy-heading">
        <span>{liberal ? 'LIBERAL' : 'FASCIST'} POLICIES</span>
        <span>
          <b>{count}</b> / {total} ENACTED
        </span>
      </div>
      <div
        className="original-board"
        aria-label={`${kind} board: ${count} of ${total} policies enacted`}
      >
        <img
          className="board-art"
          src={asset(
            liberal
              ? 'board-liberal'
              : `board-fascist-${players <= 6 ? '5-6' : players <= 8 ? '7-8' : '9-10'}`,
          )}
          alt=""
          width="1683"
          height="650"
        />
        <div className="enacted-overlay">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className="policy-slot"
              style={{
                left: `${(liberal ? 18.2 : 11) + i * (liberal ? 13.54 : 13.6)}%`,
              }}
            >
              {i < count && (
                <img
                  src={asset(`board-policy-${kind}`)}
                  alt={`${kind} policy ${i + 1}`}
                  width="174"
                  height="240"
                />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mobile-policy-track">
        {Array.from({ length: total }, (_, i) => (
          <div
            className={`mobile-policy-slot ${i < count ? 'enacted' : ''}`}
            key={i}
            title={
              !liberal && powers[i]
                ? powerNames[powers[i]!]
                : `${kind} policy ${i + 1}`
            }
          >
            {i < count ? (
              <img
                src={asset(`board-policy-${kind}`)}
                alt={`${kind} policy ${i + 1}`}
                width="174"
                height="240"
              />
            ) : (
              <>
                <b>{String(i + 1).padStart(2, '0')}</b>
                {i === total - 1 ? (
                  <Flag size={20} />
                ) : !liberal && powers[i] ? (
                  <img
                    className="power-icon"
                    src={asset(`power-${powers[i]}`)}
                    alt=""
                    width="60"
                    height="60"
                  />
                ) : (
                  <span className="empty-policy-mark">—</span>
                )}
              </>
            )}
            <span>
              {i === total - 1
                ? 'Win'
                : !liberal && powers[i]
                  ? powerNames[powers[i]!]
                      .replace('Investigate loyalty', 'Loyalty')
                      .replace('Special election', 'Elect')
                      .replace('Execution', 'Kill')
                      .replace('Policy peek', 'Peek')
                  : 'Policy'}
              {!liberal && i === 4 && ' + veto'}
            </span>
          </div>
        ))}
      </div>
      <div className="policy-caption">
        {liberal ? (
          'Enact 5 liberal policies to save the republic.'
        ) : (
          <>
            After 3 policies, electing Hitler chancellor ends the game.
            {players > 6 && (
              <span> {players <= 8 ? '7–8' : '9–10'} PLAYER TRACK</span>
            )}
          </>
        )}
      </div>
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

function ActionPanel({
  game,
  busy,
  act,
  choose,
}: {
  game: View;
  busy: boolean;
  act: (action: Action) => Promise<boolean>;
  choose: (choice: {
    action: Action;
    title: string;
    description: string;
  }) => void;
}) {
  const me = game.players.find((p) => p.id === game.me.id)!;
  const president = game.players.find((p) => p.id === game.president);
  const chancellor = game.players.find((p) => p.id === game.chancellor);
  const isPresident = game.president === me.id;
  const isChancellor = game.chancellor === me.id;
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
      ? 'Select an eligible player in the assembly below.'
      : 'Discuss who you trust while the president considers the next government.';
  } else if (game.phase === 'voting') {
    title = `${president?.name} + ${chancellor?.name}`;
    description =
      game.me.ballot === null
        ? 'Do you trust this government? Cast your ballot.'
        : 'Your ballot is sealed. Waiting for the rest of the chamber.';
  } else if (game.phase === 'president-discard') {
    title = isPresident
      ? 'Discard one policy in secret.'
      : 'The president is reviewing three policies.';
    description = isPresident
      ? 'The remaining two will be passed to the chancellor. Stay silent.'
      : 'The government must stay silent until a policy is enacted.';
  } else if (game.phase === 'chancellor-enact') {
    title = isChancellor
      ? 'Choose a policy to enact.'
      : 'The chancellor is choosing a policy.';
    description = isChancellor
      ? game.vetoDenied
        ? 'The veto was refused. You must enact one policy.'
        : 'The other policy will be discarded. Stay silent.'
      : 'The policy will be revealed to the whole chamber.';
  } else if (game.phase === 'veto-response') {
    title = isPresident
      ? 'Do you agree to the veto?'
      : 'The president is considering a veto.';
    description =
      'If both leaders agree, the policies are discarded and the election tracker advances.';
  } else if (game.phase === 'executive') {
    title = `${isPresident ? 'Your power' : `${president?.name}’s power`}: ${powerNames[game.power!]}`;
    description = isPresident
      ? game.power === 'peek'
        ? 'Privately inspect the next three policies. Read the result in your dossier.'
        : 'Choose another living player in the assembly. This power must be used.'
      : 'The president must exercise this power before the next election.';
  }
  return (
    <div
      className={`action-panel ${game.phase === 'finished' ? `victory ${game.winner}` : ''}`}
      aria-live="polite"
    >
      <p className="eyebrow">
        {game.phase === 'finished'
          ? 'THE REPUBLIC HAS DECIDED'
          : game.phase === 'voting'
            ? `VOTE FOR THIS GOVERNMENT · ${game.voted.length}/${game.players.filter((p) => p.alive).length} SEALED`
            : 'ON THE FLOOR'}
      </p>
      <h2>{title}</h2>
      <p>{description}</p>
      {game.phase === 'voting' && me.alive && (
        <div className="ballots">
          <button
            className={`ballot ja ${game.me.ballot === true ? 'selected' : ''}`}
            disabled={busy || game.me.ballot !== null}
            onClick={() => act({ type: 'vote', yes: true })}
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
                <Check /> SEALED
              </span>
            )}
          </button>
          <button
            className={`ballot nein ${game.me.ballot === false ? 'selected' : ''}`}
            disabled={busy || game.me.ballot !== null}
            onClick={() => act({ type: 'vote', yes: false })}
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
                <Check /> SEALED
              </span>
            )}
          </button>
        </div>
      )}
      {game.me.hand.length > 0 && game.phase !== 'veto-response' && (
        <div className="policy-choices">
          {game.me.hand.map((p, i) => (
            <button
              key={i}
              className={`policy-choice ${p}`}
              disabled={busy}
              onClick={() =>
                choose({
                  action: {
                    type:
                      game.phase === 'president-discard' ? 'discard' : 'enact',
                    index: i,
                  },
                  title: `${game.phase === 'president-discard' ? 'Discard' : 'Enact'} this ${p} policy?`,
                  description:
                    game.phase === 'president-discard'
                      ? 'This policy will be discarded privately. The other two go to the chancellor.'
                      : 'This policy will be enacted publicly. The other policy is discarded.',
                })
              }
            >
              <img
                src={asset(`policy-${p}`)}
                alt={`${p} policy ${i + 1}`}
                width="576"
                height="772"
              />
              <span>
                {game.phase === 'president-discard' ? 'Discard' : 'Enact'}
              </span>
            </button>
          ))}
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
            onClick={() => act({ type: 'veto' })}
          >
            Request a veto
          </Button>
        )}
      {game.phase === 'veto-response' && isPresident && (
        <div className="veto-actions">
          <Button
            disabled={busy}
            onClick={() => act({ type: 'veto-answer', yes: true })}
          >
            Agree to veto
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => act({ type: 'veto-answer', yes: false })}
          >
            Refuse veto
          </Button>
        </div>
      )}
      {game.phase === 'executive' && isPresident && game.power === 'peek' && (
        <Button
          className="action-button"
          disabled={busy}
          onClick={() => act({ type: 'power' })}
        >
          <Eye /> Inspect policies
        </Button>
      )}
      {game.phase === 'finished' && me.id === game.hostId && (
        <Button
          className="action-button"
          disabled={busy}
          onClick={() => act({ type: 'rematch' })}
        >
          Open a rematch <ArrowRight />
        </Button>
      )}
      {game.phase !== 'voting' && game.lastVote && (
        <div className="last-election">
          <span>
            LAST ELECTION <b>{game.lastVote.passed ? 'PASSED' : 'FAILED'}</b>
          </span>
          <div>
            {game.players
              .filter((p) => p.id in game.lastVote!.votes)
              .map((p) => (
                <span
                  key={p.id}
                  title={`${p.name}: ${game.lastVote!.votes[p.id] ? 'Ja' : 'Nein'}`}
                  className={
                    game.lastVote!.votes[p.id] ? 'vote-yes' : 'vote-no'
                  }
                >
                  {p.name} <b>{game.lastVote!.votes[p.id] ? 'Ja' : 'Nein'}</b>
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Conversation({
  game,
  act,
  busy,
}: {
  game: View;
  act: (action: Action) => Promise<boolean>;
  busy: boolean;
}) {
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('chat');
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
                  <p>{item.text}</p>
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
