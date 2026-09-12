'use client';

import { useId, useState } from 'react';
import { Check } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  PORTRAITS,
  PORTRAIT_CATEGORIES,
  portraitCategory,
  portraitUrl,
} from '@/lib/portraits';

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
  const [browsing, setBrowsing] = useState({
    value,
    category: portraitCategory(value),
  });
  // A restored or server-confirmed selection opens its category before children render.
  if (browsing.value !== value)
    setBrowsing({ value, category: portraitCategory(value) });
  const selected =
    PORTRAITS.find((portrait) => portrait.id === value) ?? PORTRAITS[0];
  return (
    <fieldset className="portrait-picker" disabled={disabled}>
      <legend>Choose your picture</legend>
      <Tabs
        value={browsing.category}
        className="portrait-tabs"
        onValueChange={(category) => {
          const found = PORTRAIT_CATEGORIES.find(
            (item) => item.id === category,
          );
          if (found) setBrowsing({ value, category: found.id });
        }}
      >
        <TabsList
          className="portrait-categories"
          aria-label="Avatar categories"
        >
          {PORTRAIT_CATEGORIES.map((category) => (
            <TabsTrigger
              key={category.id}
              value={category.id}
              disabled={disabled}
            >
              {category.label} <span>10</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {PORTRAIT_CATEGORIES.map((category) => (
          <TabsContent key={category.id} value={category.id}>
            <div className="portrait-options">
              {PORTRAITS.filter(
                (portrait) => portrait.category === category.id,
              ).map((portrait) => (
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
                  <img
                    src={portraitUrl(portrait.id)}
                    alt=""
                    width="72"
                    height="72"
                    decoding="async"
                  />
                  {value === portrait.id && (
                    <Check
                      className="portrait-check"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </label>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <p className="portrait-selection">
        Selected: <strong>{selected.label}</strong>
      </p>
    </fieldset>
  );
}
