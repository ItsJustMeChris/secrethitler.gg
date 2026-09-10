'use client';

import { useState } from 'react';
import { Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyFairness } from '@/lib/fairness';
import type { FairnessView } from '@/lib/fairness';

type Receipt = { commitment: string; beforeDeal: boolean };
type SavedProof = { proof: FairnessView; receipt: Receipt | null };
const storageKey = 'sh-fair-receipts';

export function rememberFairness(proof: FairnessView | null, phase: string) {
  if (!proof) return;
  try {
    const receipts = JSON.parse(
      localStorage.getItem(storageKey) ?? '{}',
    ) as Record<string, Receipt>;
    receipts[proof.id] ??= {
      commitment: proof.commitment,
      beforeDeal: phase === 'lobby',
    };
    localStorage.setItem(
      storageKey,
      JSON.stringify(Object.fromEntries(Object.entries(receipts).slice(-20))),
    );
    if (proof.reveal)
      localStorage.setItem(
        'sh-last-proof',
        JSON.stringify({ proof, receipt: receipts[proof.id] }),
      );
  } catch {
    /* Storage may be unavailable; never claim a saved commitment in that case. */
  }
}

export function FairPlayProof({ proof }: { proof: FairnessView | null }) {
  const [previous, setPrevious] = useState<SavedProof | null>(null);
  const [result, setResult] = useState('');
  const [verifying, setVerifying] = useState(false);
  const selected = previous?.proof ?? proof;
  function savedReceipt(): Receipt | null {
    if (previous) return previous.receipt;
    try {
      return (
        JSON.parse(localStorage.getItem(storageKey) ?? '{}')[selected!.id] ??
        null
      );
    } catch {
      return null;
    }
  }
  async function verify() {
    if (!selected) return;
    setVerifying(true);
    setResult('');
    try {
      const receipt = savedReceipt();
      if (!receipt)
        throw new Error(
          'No earlier commitment was saved on this device. You can download the record, but cannot verify it against an earlier receipt here.',
        );
      const checked = await verifyFairness(selected, receipt.commitment);
      setResult(
        `${checked.shuffles} shuffles replayed successfully, including roles for ${checked.players} players and the first president. The seed matches this device’s ${receipt.beforeDeal ? 'pre-deal' : 'after-deal'} receipt.`,
      );
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }
  function download() {
    if (!selected?.reveal) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            protocol: 'sh-shuffle-v1',
            proof: selected,
            receipt: savedReceipt(),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `secret-hitler-shuffle-${selected.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="fair-proof">
      <h3>
        <ShieldCheck size={20} /> Fair play: the math & receipt
      </h3>
      <p>
        The server commits to a secret random seed for each new lobby. Your
        browser saves its SHA-256 fingerprint. After the match, the seed and
        shuffle record are revealed so you can replay the shuffles on your
        device.
      </p>
      {selected ? (
        <>
          <p>
            <strong>
              {previous
                ? 'Previous match'
                : selected.reveal
                  ? 'Match complete · seed revealed'
                  : 'Seed sealed until the match ends'}
            </strong>
          </p>
          <code className="proof-hash">{selected.commitment}</code>
          <p className="proof-meta">
            {selected.shuffleCount} recorded shuffles · roles, policies, first
            president, and policy reshuffles.
          </p>
          {selected.reveal && (
            <div className="proof-actions">
              <Button onClick={verify} disabled={verifying}>
                {verifying ? 'Replaying…' : 'Verify this match'}
              </Button>
              <Button variant="outline" onClick={download}>
                <Download /> Download receipt
              </Button>
            </div>
          )}
        </>
      ) : (
        <p>
          This match predates shuffle receipts. A new receipt is created when
          the next lobby opens.
        </p>
      )}
      <div className="proof-actions">
        <button
          className="text-button"
          onClick={() => {
            try {
              const saved = JSON.parse(
                localStorage.getItem('sh-last-proof') ?? 'null',
              ) as SavedProof | null;
              if (!saved) {
                setResult(
                  'No completed match receipt is saved on this device yet.',
                );
                return;
              }
              setPrevious(saved);
              setResult('');
            } catch {
              setResult('The saved receipt is unavailable.');
            }
          }}
        >
          Last completed match
        </button>
        {previous && (
          <button
            className="text-button"
            onClick={() => {
              setPrevious(null);
              setResult('');
            }}
          >
            Current table
          </button>
        )}
      </div>
      {result && (
        <output className="proof-result">
          {result}
        </output>
      )}
      <details>
        <summary>Why each seat has equal odds</summary>
        <p>
          Fisher–Yates picks one of n positions, then one of n − 1, and so on.
          With independent uniform picks, every labeled ordering has
          probability:
        </p>
        <p className="math-line">1/n × 1/(n − 1) × … × 1/2 = 1/n!</p>
        <p>
          With L Liberals, F ordinary Fascists and one Hitler, each distinct
          role assignment therefore has probability L! × F! / n!. Every seat has
          P(Hitler) = 1/n, P(Liberal) = L/n, and P(Fascist) = F/n.
        </p>
        <p>
          A fresh policy deck has 6 Liberal and 11 Fascist cards. Each distinct
          color order has probability 6! × 11! / 17! = 1/12,376. The first draw
          is Liberal with probability 6/17; three Fascist cards have probability
          C(11,3) / C(17,3) = 165/680 ≈ 24.26%.
        </p>
        <p>
          To avoid modulo bias, we accept a 32-bit value x only when x &lt;
          floor(2³²/m) × m, then use x mod m. Each result has the same number of
          accepted values.
        </p>
        <p>
          The implementation derives pseudorandom values from a fresh 256-bit
          seed using AES-CTR. The equal-odds argument assumes uniform random
          values; the implementation relies on the browser/server cryptographic
          generator and AES security.
        </p>
        <p>
          <a
            href="https://xlinux.nist.gov/dads/HTML/fisherYatesShuffle.html"
            target="_blank"
            rel="noreferrer"
          >
            NIST: Fisher–Yates
          </a>{' '}
          ·{' '}
          <a
            href="https://www.w3.org/TR/WebCryptoAPI/"
            target="_blank"
            rel="noreferrer"
          >
            W3C: Web Cryptography
          </a>
        </p>
      </details>
      <p className="proof-limits">
        This checks that the recorded shuffles reproduce the saved seed
        commitment. It is not a proof that the server chose its seed honestly,
        that every dealt card matched the record, or that players cannot
        collude. Solo games and late arrivals first see the commitment after the
        deal. Keep the downloaded receipt for an independent comparison.
      </p>
    </section>
  );
}
