'use client';

import type { ReactNode } from 'react';
import { Crown, Flag, Skull } from 'lucide-react';
import type { GameView } from '@/lib/game';
import { playerOffice } from '@/lib/game-presentation';
import { playerKnowledge } from '@/lib/player-knowledge';
import { portraitUrl } from '@/lib/portraits';

type Player = {
  name: string;
  portrait: number;
  alive?: boolean;
  bot?: boolean;
  connected?: boolean;
};

// A single neutral card face for the assembly, player choices, and dossiers.
// The caller may supply only information already visible to the seated player.
export function PlayerCard({
  player,
  seat,
  you,
  office,
  status,
  knowledge,
  children,
}: {
  player: Player;
  seat?: number;
  you?: boolean;
  office?: ReturnType<typeof playerOffice>;
  status?: string;
  knowledge?: ReturnType<typeof playerKnowledge>;
  children?: ReactNode;
}) {
  const eliminated = player.alive === false;
  return (
    <span
      className={`player-card ${eliminated ? 'eliminated' : ''} ${office ? `${office.kind}-office` : ''}`}
      title={[
        player.name,
        office?.label,
        eliminated ? 'Executed' : status,
        knowledge?.label,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <span className="player-card-header">
        <span>{seat ? String(seat).padStart(2, '0') : 'PLAYER'}</span>
        <span>{you ? 'YOU' : player.bot ? 'AI' : ''}</span>
        {player.connected !== undefined && (
          <span
            className={`status-dot ${player.connected ? '' : 'offline'}`}
            aria-label={
              player.connected ? 'Connected' : 'Disconnected — seat saved'
            }
            title={player.connected ? 'Connected' : 'Disconnected — seat saved'}
          />
        )}
      </span>
      <span className="player-card-art">
        <img
          src={portraitUrl(player.portrait, eliminated)}
          alt=""
          width="256"
          height="256"
          draggable={false}
        />
        {children}
      </span>
      <b className="player-card-name">
        <span>{player.name}</span>
      </b>
      <span className="player-card-footer">
        <span className="player-card-status">
          {eliminated ? (
            <Skull size={12} aria-hidden="true" />
          ) : office?.kind === 'president' ? (
            <Crown size={12} aria-hidden="true" />
          ) : office?.kind === 'chancellor' ? (
            <Flag size={12} aria-hidden="true" />
          ) : null}
          {eliminated ? 'Executed' : (office?.label ?? status ?? 'In play')}
        </span>
        {knowledge ? (
          <strong
            className={`known-role ${knowledge.kind}`}
            aria-label={`${knowledge.source === 'party' ? 'Private investigation' : 'Role you know'}: ${knowledge.label}`}
          >
            {knowledge.label}
          </strong>
        ) : (
          <span className="player-card-detail">
            {office && status !== office.label ? status : '\u00a0'}
          </span>
        )}
      </span>
    </span>
  );
}

export function TablePlayerCard({
  game,
  playerId,
  status,
  children,
}: {
  game: GameView;
  playerId: string;
  status?: string;
  children?: ReactNode;
}) {
  const index = game.players.findIndex((player) => player.id === playerId);
  const player = game.players[index];
  if (!player) return null;
  const defaultStatus =
    game.phase === 'finished'
      ? 'Survived'
      : player.departed
        ? 'Away'
        : game.phase === 'lobby'
          ? player.ready
            ? 'Ready'
            : 'Waiting'
          : game.phase === 'voting' && game.voted.includes(player.id)
            ? 'Voted'
            : game.eligible.includes(player.id)
              ? 'Eligible'
              : player.id === game.lastChancellor ||
                  (game.players.filter((p) => p.alive).length > 5 &&
                    player.id === game.lastPresident)
                ? 'Term-limited'
                : 'In play';
  return (
    <PlayerCard
      player={player}
      seat={index + 1}
      you={player.id === game.me.id}
      office={playerOffice(game, player.id)}
      status={status ?? defaultStatus}
      knowledge={playerKnowledge(game, player.id)}
    >
      {children}
    </PlayerCard>
  );
}
