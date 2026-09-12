import type { GameView } from './game.ts';

export type DossierState = {
  match: string | null;
  open: boolean;
  pending: boolean;
};

export const closedDossier: DossierState = {
  match: null,
  open: false,
  pending: false,
};

type DossierEvent =
  | { type: 'receive'; game: GameView; visible: boolean }
  | { type: 'open' | 'dismiss' | 'hide' | 'resume' | 'expire' | 'reset' };

// Only presentation state is retained; roles and other private contents stay in GameView.
export function dossierReducer(
  state: DossierState,
  event: DossierEvent,
): DossierState {
  switch (event.type) {
    case 'receive': {
      const game = event.game;
      if (game.phase === 'lobby' || !game.me.role) return closedDossier;
      const match = JSON.stringify([game.code, game.me.id, game.fairness?.id]);
      if (match !== state.match) {
        const pending = game.phase !== 'finished';
        return { match, pending, open: pending && event.visible };
      }
      if (game.phase === 'finished' && state.pending)
        return { ...state, open: false, pending: false };
      return state;
    }
    case 'open':
      return { ...state, open: true };
    case 'dismiss':
      return { ...state, open: false, pending: false };
    case 'hide':
      return { ...state, open: false };
    case 'resume':
      return state.pending ? { ...state, open: true } : state;
    case 'expire':
      // An opening reveal waits for acknowledgement, even across backgrounding.
      return state.pending ? state : { ...state, open: false };
    case 'reset':
      return closedDossier;
  }
}
