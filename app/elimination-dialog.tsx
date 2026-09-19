'use client';

import { Eye, Skull } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GameDialog as Dialog } from './game-dialog';
import { portraitUrl } from '@/lib/portraits';

export function EliminationDialog({
  open,
  onOpenChange,
  player,
  finished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: { name: string; portrait: number };
  finished: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="paper elimination-dialog">
        <DialogHeader>
          <p className="eyebrow">A DRAMATIC EXIT</p>
          <DialogTitle>You were killed!</DialogTitle>
          <DialogDescription>
            {finished
              ? 'Your final act. The match is over.'
              : 'You’re out of this match, but you can stay and watch.'}
          </DialogDescription>
        </DialogHeader>
        <div className="elimination-portrait">
          <img
            src={portraitUrl(player.portrait, true)}
            alt={`${player.name} with a cartoon knocked-out expression`}
            width="256"
            height="256"
          />
          <span className="elimination-stamp">
            <Skull size={18} aria-hidden="true" /> Eliminated
          </span>
        </div>
        <p className="elimination-name">{player.name}</p>
        <p className="elimination-guidance">
          {finished
            ? 'Review the result at the table. You’ll be back for the next deal.'
            : 'No more votes, actions, or chat. Keep your role secret until the match ends.'}
        </p>
        <Button className="primary-button" onClick={() => onOpenChange(false)}>
          <Eye /> {finished ? 'View the results' : 'Keep watching'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
