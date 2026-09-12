'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '@/lib/game';
import {
  newElectionResult,
  newPolicyResult,
  tableCue,
  type ElectionResult,
  type PolicyResult,
  type TableCue,
} from '@/lib/game-presentation';

export function useGameFeedback() {
  const [cue, setCue] = useState<TableCue | null>(null);
  const [election, setElection] = useState<ElectionResult | null>(null);
  const [policy, setPolicy] = useState<PolicyResult | null>(null);
  const [sound, setSound] = useState(false);
  const [motion, setMotion] = useState(true);
  const audio = useRef<AudioContext | null>(null);
  const audible = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const electionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const policyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tone = useCallback((kind: TableCue['kind']) => {
    const context = audio.current;
    if (
      !audible.current ||
      !context ||
      context.state !== 'running' ||
      document.hidden
    )
      return;
    const notes =
      kind === 'victory'
        ? [261.63, 329.63, 392, 523.25]
        : kind === 'policy'
          ? [174.61, 261.63]
          : kind === 'execution'
            ? [146.83, 110]
            : [392, 523.25];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const at = context.currentTime + index * 0.09;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.045, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.32);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
    });
  }, []);
  const toggleSound = async () => {
    if (audible.current) {
      audible.current = false;
      setSound(false);
      await audio.current?.suspend();
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      audible.current = audio.current.state === 'running';
      setSound(audible.current);
      tone('turn');
    } catch {
      audible.current = false;
      setSound(false);
    }
  };
  const receive = useCallback(
    (previous: GameView | null, next: GameView) => {
      const changedTable =
        previous?.code !== next.code ||
        previous?.fairness?.id !== next.fairness?.id;
      if (changedTable || next.phase === 'lobby') {
        if (timer.current) clearTimeout(timer.current);
        setCue(null);
        if (policyTimer.current) clearTimeout(policyTimer.current);
        setPolicy(null);
      }
      if (changedTable || next.phase === 'lobby' || next.phase === 'voting') {
        if (electionTimer.current) clearTimeout(electionTimer.current);
        setElection(null);
      }
      const revealed = newElectionResult(previous, next);
      if (revealed && !document.hidden) {
        if (electionTimer.current) clearTimeout(electionTimer.current);
        setElection(revealed);
        electionTimer.current = setTimeout(() => setElection(null), 6500);
      }
      const enacted = newPolicyResult(previous, next);
      if (enacted && !document.hidden) {
        if (policyTimer.current) clearTimeout(policyTimer.current);
        setPolicy(enacted);
        policyTimer.current = setTimeout(() => setPolicy(null), 6500);
      }
      const event = tableCue(previous, next);
      if (!event || document.hidden) return;
      if (timer.current) clearTimeout(timer.current);
      setCue(event);
      tone(event.kind);
      timer.current = setTimeout(
        () => setCue(null),
        event.kind === 'victory' ? 4200 : 2400,
      );
    },
    [tone],
  );
  useEffect(() => {
    document.documentElement.dataset.gameMotion = motion ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset.gameMotion;
    };
  }, [motion]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (electionTimer.current) clearTimeout(electionTimer.current);
      if (policyTimer.current) clearTimeout(policyTimer.current);
      void audio.current?.close();
    },
    [],
  );
  return {
    cue,
    election,
    policy,
    sound,
    motion,
    setMotion,
    toggleSound,
    receive,
  };
}
