'use client';

import { useEffect, useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { transferRequest } from '../seat-transfer';

export default function TransferSeat() {
  const captured = useRef(false);
  const pending = useRef(false);
  const [grant, setGrant] = useState<{ code: string; token: string } | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('room') ?? '';
    const token = params.get('token') ?? '';
    // Fragments are never sent in HTTP URLs/referrers. Remove the secret from
    // this history entry immediately and keep it only in component memory.
    history.replaceState(null, '', '/transfer');
    if (/^[A-HJ-NP-Z2-9]{8}$/.test(code) && /^[a-f0-9]{64}$/.test(token)) {
      // Capture browser-only state after hydration, then immediately scrub it.
      // oxlint-disable-next-line react/react-compiler
      setGrant({ code, token });
    }
    setLoaded(true);
  }, []);

  async function claim() {
    if (!grant || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await transferRequest({ operation: 'claim', ...grant });
      // Navigation restores through the new HttpOnly cookie; no role or
      // credential is persisted in browser storage.
      location.replace(`/?room=${encodeURIComponent(result.code!)}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Could not move your seat. Try again.',
      );
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <main className="transfer-page">
      <section className="paper transfer-card">
        <p className="eyebrow">YOUR PLACE AT THE TABLE</p>
        <h1>
          <Smartphone /> Move your seat here
        </h1>
        {!loaded ? (
          <p>Checking your link…</p>
        ) : grant ? (
          <>
            <p>
              Continue at table <strong>{grant.code}</strong> with your existing
              name, portrait, role, and host status.
            </p>
            <p>
              Your previous device will sign out. This replaces any seat session
              in this browser.
            </p>
            <Button
              className="primary-button"
              disabled={busy}
              onClick={() => void claim()}
            >
              {busy ? 'Moving your seat…' : 'Use this seat on this device'}
            </Button>
            <p className="transfer-help">
              Only continue with a link you created from “Your seat.” The link
              works once and expires after 10 minutes.
            </p>
          </>
        ) : (
          <p>
            This transfer link is missing or incomplete. Open the full private
            link, or create a new one from “Your seat” on your original device.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <a href={grant ? `/?room=${grant.code}` : '/'}>Back to the game</a>
      </section>
    </main>
  );
}
