'use client';

import { Check, ChevronDown, Crown, Flag, LockKeyhole, X } from 'lucide-react';
import type { GameView } from '@/lib/game';
import {
  policyResultTitle,
  type ElectionResult,
  type PolicyResult,
} from '@/lib/game-presentation';
import { asset } from './game-board';

export function ElectionRecap({
  result,
  fresh,
}: {
  result: ElectionResult;
  fresh: boolean;
}) {
  return (
    <details
      className={`election-recap ${result.passed ? 'passed' : 'rejected'} ${fresh ? 'fresh-event' : ''}`}
    >
      <summary aria-live={fresh ? 'polite' : 'off'} aria-atomic="true">
        <span className="election-outcome">
          {result.passed ? <Check size={16} /> : <X size={16} />}
          <b>{result.passed ? 'Elected' : 'Rejected'}</b>
          <small>Round {result.round}</small>
        </span>
        <span className="election-totals">
          <b className="ja-total">{result.yes} Ja</b>
          <span> / </span>
          <b className="nein-total">{result.no} Nein</b>
          <ChevronDown size={15} className="recap-chevron" />
        </span>
        <span className="election-government">
          <span
            className="president-office"
            title={`President: ${result.president}`}
          >
            <Crown size={13} /> {result.president}
          </span>
          <span
            className="chancellor-office"
            title={`Chancellor: ${result.chancellor}`}
          >
            <Flag size={13} /> {result.chancellor}
          </span>
        </span>
        <span className="sr-only">View everyone’s vote</span>
      </summary>
      <ul
        className="election-ballots"
        aria-label={`Round ${result.round} public ballots`}
      >
        {result.ballots.map((ballot) => (
          <li key={ballot.id}>
            <span>{ballot.name}</span>
            <b className={ballot.yes ? 'ja-total' : 'nein-total'}>
              {ballot.yes ? 'Ja' : 'Nein'}
            </b>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function PolicyRecap({
  result,
  fresh,
}: {
  result: PolicyResult;
  fresh: boolean;
}) {
  return (
    <div
      className={`policy-recap ${result.kind} ${fresh ? 'fresh-event' : ''}`}
    >
      <img
        src={asset(`board-policy-${result.kind}`)}
        width="174"
        height="240"
        alt=""
      />
      <div>
        <b>{policyResultTitle(result)}</b>
        <span>
          Round {result.round} · {result.count}/
          {result.kind === 'liberal' ? 5 : 6} enacted
          {result.source === 'chaos'
            ? ' · Election tracker: no executive power'
            : result.president && ` · President: ${result.president.name}`}
        </span>
      </div>
      {fresh && (
        <output className="sr-only">{policyResultTitle(result)}.</output>
      )}
    </div>
  );
}

export function PlayerEvent({
  playerId,
  phase,
  sealed,
  election,
  policy,
  freshElection,
}: {
  playerId: string;
  phase: GameView['phase'];
  sealed: boolean;
  election: ElectionResult | null;
  policy: PolicyResult | null;
  freshElection: boolean;
}) {
  const ballot = election?.ballots.find((item) => item.id === playerId);
  return (
    <div className="player-event-slot">
      {phase === 'voting' ? (
        sealed ? (
          <span className="ballot-sealed" aria-label="Ballot sealed">
            <LockKeyhole size={14} />
          </span>
        ) : null
      ) : policy?.chancellor?.id === playerId ? (
        <span
          key={policy.id}
          className={`player-policy-bubble ${policy.kind} fresh-event`}
          aria-label={policyResultTitle(policy)}
        >
          <small>Enacted</small>
          <b>{policy.kind === 'liberal' ? 'Liberal' : 'Fascist'}</b>
        </span>
      ) : ballot ? (
        <span
          key={election!.id}
          className={`player-vote-bubble ${ballot.yes ? 'ja' : 'nein'} ${freshElection ? 'fresh-event' : ''}`}
          title={`Round ${election!.round}: ${ballot.name} voted ${ballot.yes ? 'Ja' : 'Nein'}`}
          aria-label={`Round ${election!.round}: ${ballot.name} voted ${ballot.yes ? 'Ja' : 'Nein'}`}
        >
          {ballot.yes ? 'Ja!' : 'Nein!'}
        </span>
      ) : null}
    </div>
  );
}
