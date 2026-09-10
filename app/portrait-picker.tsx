'use client';

import { useId } from 'react';
import { Check } from 'lucide-react';
import { PORTRAITS, portraitUrl } from '@/lib/portraits';

export function PortraitPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const group = useId();
  return (
    <fieldset className="portrait-picker" disabled={disabled}>
      <legend>Choose your picture</legend>
      <div className="portrait-options">
        {PORTRAITS.map((portrait) => (
          <label
            key={portrait.id}
            className={`portrait-option ${value === portrait.id ? 'selected' : ''}`}
            title={portrait.label}
          >
            <input
              type="radio"
              name={group}
              value={portrait.id}
              checked={value === portrait.id}
              onChange={() => onChange(portrait.id)}
              aria-label={portrait.label}
            />
            <img src={portraitUrl(portrait.id)} alt="" width="48" height="48" />
            {value === portrait.id && (
              <Check className="portrait-check" size={14} aria-hidden="true" />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
