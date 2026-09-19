'use client';

import type { ComponentProps } from 'react';
import { Dialog } from '@/components/ui/dialog';

// Tear down the modal/focus lock when dismissed, without waiting for an exit
// animation that can be interrupted by a tab switch or a second private dialog.
export function GameDialog(props: ComponentProps<typeof Dialog>) {
  return props.open ? <Dialog {...props} /> : null;
}
