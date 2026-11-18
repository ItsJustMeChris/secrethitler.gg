'use client';

import { useId } from 'react';
import { powerTrack, type Policy } from '@/lib/game';

export const asset = (name: string) => `/assets/${name}.png?v=6b210bae`;

export function PolicyBoard({
  kind,
  count,
  players,
  highlightedCount,
  tracker = 0,
  investigateInsteadOfPeek = false,
}: {
  kind: Policy;
  count: number;
  players: number;
  highlightedCount?: number;
  tracker?: number;
  investigateInsteadOfPeek?: boolean;
}) {
  const titleId = useId();
  const investigationIconId = useId();
  const total = kind === 'liberal' ? 5 : 6;
  const liberal = kind === 'liberal';
  const powers = powerTrack(players, investigateInsteadOfPeek);
  const houseBoard = !liberal && players <= 6 && investigateInsteadOfPeek;
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
      <div className="policy-board-art">
        <svg
          className="original-board"
          viewBox="0 0 1683 650"
          preserveAspectRatio="xMidYMid meet"
          aria-labelledby={titleId}
        >
          <title id={titleId}>
            {kind} board: {count} of {total} policies enacted.{' '}
            {liberal
              ? `Five policies win. Election tracker: ${tracker} failed governments.`
              : powers
                  .map(
                    (power, i) =>
                      `Policy ${i + 1}: ${i === 5 ? 'victory' : (power ?? 'no executive power')}${i === 4 ? ', veto unlocked' : ''}`,
                  )
                  .join('. ')}
          </title>
          <image href={asset(board)} width="1683" height="650" />
          {houseBoard && (
            <g className="house-investigation-slot" aria-hidden="true">
              <mask
                id={investigationIconId}
                maskUnits="userSpaceOnUse"
                style={{ maskType: 'alpha' }}
              >
                <image
                  href={asset('power-investigate')}
                  x="673"
                  y="219"
                  width="114"
                  height="114"
                />
              </mask>
              <rect x="631" y="213" width="188" height="184" fill="#fc5f4a" />
              <rect
                x="673"
                y="219"
                width="114"
                height="114"
                mask={`url(#${investigationIconId})`}
              />
              <text x="725" y="367" textAnchor="middle">
                <tspan x="725">INVESTIGATE A PLAYER’S</tspan>
                <tspan x="725" dy="16">
                  PARTY MEMBERSHIP
                </tspan>
              </text>
            </g>
          )}
          {liberal && (
            <g
              className="election-puck"
              transform={`translate(${602 + 154.5 * tracker} 519)`}
              aria-hidden="true"
            >
              <circle r="22" />
              <circle className="election-puck-rim" r="16" />
            </g>
          )}
          {Array.from({ length: count }, (_, i) => {
            const x =
              (1683 * ((liberal ? 18.2 : 11) + i * (liberal ? 13.54 : 13.6))) /
              100;
            return (
              <g key={i} className="enacted-policy">
                <image
                  href={asset(`board-policy-${kind}`)}
                  x={x}
                  y="195"
                  width="168.3"
                  height={(168.3 * 240) / 174}
                />
                {i + 1 === highlightedCount && (
                  <rect
                    className="policy-highlight"
                    x={x - 5}
                    y="190"
                    width="178.3"
                    height={(168.3 * 240) / 174 + 10}
                    rx="10"
                    aria-hidden="true"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
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

export function PolicyPeek({ policies }: { policies: Policy[] }) {
  return (
    <ol
      className="peek-policies"
      aria-label="Inspected policies, top of deck first"
    >
      {policies.map((kind, index) => (
        <li key={index}>
          <PolicyCard kind={kind} index={index} />
          <span>{index === 0 ? '1 · Top' : `${index + 1} · Next`}</span>
        </li>
      ))}
    </ol>
  );
}

export function MembershipCard({ party }: { party: Policy }) {
  return (
    <img
      className="membership-card"
      src={asset(`membership-${party}`)}
      alt={`${party === 'liberal' ? 'Liberal' : 'Fascist'} party membership`}
      width="500"
      height="713"
    />
  );
}
