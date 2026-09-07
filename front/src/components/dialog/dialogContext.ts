import { createContext } from 'react';

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';

export type DialogOptions = {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type DialogContextValue = {
  notify: (options: string | DialogOptions) => Promise<void>;
  confirm: (options: string | DialogOptions) => Promise<boolean>;
};

export const DialogContext = createContext<DialogContextValue | null>(null);
