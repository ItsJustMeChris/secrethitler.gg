'use client';

import { useEffect, useState } from 'react';
import { EyeOff, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Policy } from '@/lib/game';
import { portraitUrl } from '@/lib/portraits';

export function InvestigationDialog({
  open,
  onOpenChange,
  player,
  party,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: { name: string; portrait: number };
  party: Policy;
}) {
  const [visible, setVisible] = useState(
    () =>
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.hasFocus(),
  );
  useEffect(() => {
    const hide = () => setVisible(false);
    const resume = () => setVisible(!document.hidden && document.hasFocus());
    window.addEventListener('blur', hide);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('blur', hide);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const revealed = open && visible;
  return (
    <Dialog open={revealed} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="dossier-dialog paper investigation-dialog">
        <DialogHeader>
          <p className="eyebrow">FOR YOUR EYES ONLY</p>
          <DialogTitle>Investigation dossier</DialogTitle>
          <DialogDescription>
            This result is private to you. Close it when you are ready.
          </DialogDescription>
        </DialogHeader>
        {revealed && (
          <div className="dossier-content investigation-content">
            <img
              className="role-image investigation-portrait"
              src={portraitUrl(player.portrait)}
              alt=""
              width="256"
              height="256"
            />
            <div>
              <h3>{player.name}</h3>
              <div className={`investigation-membership ${party}`}>
                <span>Party membership</span>
                <strong>{party === 'liberal' ? 'Liberal' : 'Fascist'}</strong>
              </div>
              <p>
                {party === 'fascist'
                  ? 'This reveals Fascist party membership. It does not tell you whether this player is Hitler.'
                  : 'This player belongs to the Liberal party.'}
              </p>
            </div>
          </div>
        )}
        <p className="investigation-privacy">
          <LockKeyhole size={14} aria-hidden="true" />
          Saved in your secret dossier. Hidden when you switch away.
        </p>
        <Button className="primary-button" onClick={() => onOpenChange(false)}>
          <EyeOff /> Got it · close result
        </Button>
      </DialogContent>
    </Dialog>
  );
}
