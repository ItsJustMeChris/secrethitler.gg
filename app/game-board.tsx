'use client';

import { useId } from 'react';
import { powerTrack, type Policy } from '@/lib/game';

export const asset = (name: string) => `/assets/${name}.png?v=6b210bae`;

export function PolicyBoard({
  kind,
  count,
  players,
}: {
  kind: Policy;
  count: number;
  players: number;
}) {
  const titleId = useId();
  const total = kind === 'liberal' ? 5 : 6;
  const liberal = kind === 'liberal';
  const powers = powerTrack(players);
  const board = liberal
    ? 'board-liberal'
    : `board-fascist-${players <= 6 ? '5-6' : players <= 8 ? '7-8' : '9-10'}`;
  return (
    <section
      className={`policy-section ${kind}`}
      aria-label={`${kind} policies`}
    >
      <div className="policy-heading">
        <h2>{liberal ? 'Liberal' : 'Fascist'} policies</h2>
        <span>
          <b>{count}</b> / {total}
        </span>
      </div>
      <svg
        className="original-board"
        viewBox="0 0 1683 650"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {kind} board: {count} of {total} policies enacted.{' '}
          {liberal
            ? 'Five policies win.'
            : powers
                .map(
                  (power, i) =>
                    `Policy ${i + 1}: ${i === 5 ? 'victory' : (power ?? 'no executive power')}${i === 4 ? ', veto unlocked' : ''}`,
                )
                .join('. ')}
        </title>
        <image href={asset(board)} width="1683" height="650" />
        {Array.from({ length: count }, (_, i) => (
          <g key={i} className="enacted-policy">
            <image
              href={asset(`board-policy-${kind}`)}
              x={
                (1683 *
                  ((liberal ? 18.2 : 11) + i * (liberal ? 13.54 : 13.6))) /
                100
              }
              y="195"
              width="168.3"
              height={(168.3 * 240) / 174}
            />
          </g>
        ))}
      </svg>
    </section>
  );
}

export function PolicyCard({ kind, index }: { kind: Policy; index: number }) {
  return (
    <img
      className="policy-card"
      src={asset(`policy-${kind}`)}
      alt={`${kind} policy ${index + 1}`}
      width="576"
      height="772"
      draggable={false}
    />
  );
}
