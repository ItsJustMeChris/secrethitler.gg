'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export async function transferRequest(input: Record<string, unknown>) {
  const response = await fetch('/api/table/transfer', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await response.json()) as {
    error?: string;
    token?: string;
    expires?: number;
    code?: string;
  };
  if (!response.ok)
    throw new Error(
      data.error ?? 'The transfer could not be confirmed. Try again.',
    );
  return data;
}

export function SeatTransfer({
  code,
  disabled,
}: {
  code: string;
  disabled: boolean;
}) {
  const [link, setLink] = useState<{ url: string; expires: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!link) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [link]);
  const expired = !!link && now >= link.expires;

  async function change(operation: 'create' | 'revoke') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const data = await transferRequest({ operation, code });
      if (operation === 'create') {
        const url = new URL('/transfer', location.origin);
        url.hash = new URLSearchParams({
          room: code,
          token: data.token!,
        }).toString();
        setNow(Date.now());
        setLink({ url: url.toString(), expires: data.expires! });
      } else {
        setLink(null);
        setMessage('Transfer link canceled. Your seat stays here.');
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not update the transfer link. Try again.',
      );
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <section className="seat-transfer" aria-labelledby="seat-transfer-title">
      <h3 id="seat-transfer-title">
        <Smartphone size={18} /> Move to another device
      </h3>
      <p>
        Open a private link on your other device to keep this seat, role, and
        host status. This device signs out when you use it.
      </p>
      <p>
        Keep the link private: anyone with it can take your seat. Keep this
        table open until you finish.
      </p>
      {link && (
        <div className="transfer-link">
          <label htmlFor="seat-transfer-link">Your private transfer link</label>
          <Input
            id="seat-transfer-link"
            readOnly
            value={link.url}
            onFocus={(event) => event.target.select()}
          />
          <Button
            variant="outline"
            disabled={expired || busy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.url);
                setMessage(
                  'Private link copied. Open it on your other device.',
                );
              } catch {
                setMessage('Select the link above and copy it manually.');
              }
            }}
          >
            <Copy /> Copy private link
          </Button>
          <span>
            {expired
              ? 'This link expired. Create a new one below.'
              : `Single use · expires in ${Math.ceil((link.expires - now) / 60_000)} min`}
          </span>
        </div>
      )}
      <div className="settings-links">
        <Button
          variant="outline"
          disabled={disabled || busy}
          onClick={() => void change('create')}
        >
          <Smartphone />{' '}
          {busy
            ? 'Updating…'
            : link
              ? 'Create new link'
              : 'Create private link'}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || busy}
          onClick={() => void change('revoke')}
        >
          Cancel transfer link
        </Button>
      </div>
      <small>
        Links expire after 10 minutes. Creating a new link replaces the previous
        one.
      </small>
      <output aria-live="polite">{message}</output>
    </section>
  );
}
