import React, { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';
import Button from './Button';
import { DialogContext } from './dialog/dialogContext';
import type { DialogContextValue, DialogOptions, DialogTone } from './dialog/dialogContext';
import ModalFrame from './dialog/ModalFrame';

type DialogState = DialogOptions & {
  id: number;
  scope: symbol;
  mode: 'alert' | 'confirm';
  resolve: (value: boolean) => void;
};

const toneStyles: Record<DialogTone, { icon: React.ReactNode; badge: string; title: string; button: 'primary' | 'secondary' | 'danger' | 'warning' }> = {
  info: {
    icon: <Info size={26} />,
    badge: 'bg-blue-50 text-secondary border-blue-100',
    title: '알림',
    button: 'secondary',
  },
  success: {
    icon: <CheckCircle2 size={26} />,
    badge: 'bg-green-50 text-brand border-green-100',
    title: '완료',
    button: 'primary',
  },
  warning: {
    icon: <AlertTriangle size={26} />,
    badge: 'bg-yellow-50 text-warning-border border-yellow-100',
    title: '확인 필요',
    button: 'warning',
  },
  danger: {
    icon: <AlertTriangle size={26} />,
    badge: 'bg-red-50 text-danger border-red-100',
    title: '주의',
    button: 'danger',
  },
};

const normalizeOptions = (options: string | DialogOptions): DialogOptions => {
  if (typeof options === 'string') return { message: options };
  return options;
};

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [storedDialog, setDialog] = useState<DialogState | null>(null);
  const queue = useRef<DialogState[]>([]);
  const nextId = useRef(0);
  const { key: routeKey, pathname, search, hash } = useLocation();
  const scope = useMemo(() => Symbol(`${routeKey}:${pathname}${search}${hash}`), [routeKey, pathname, search, hash]);
  const dialog = storedDialog?.scope === scope ? storedDialog : null;
  const activeScope = useRef<symbol | null>(scope);
  const titleId = useId(), messageId = useId();

  useLayoutEffect(() => {
    const pending = queue.current;
    activeScope.current = scope;
    return () => {
      activeScope.current = null;
      pending.splice(0).forEach(item => item.resolve(false));
    };
  }, [scope]);

  const openDialog = useCallback((mode: DialogState['mode'], options: string | DialogOptions) => {
    // A response from an abandoned screen must not open a popup on the next one.
    if (activeScope.current !== scope) return Promise.resolve(false);
    const normalized = normalizeOptions(options);
    return new Promise<boolean>((resolve) => {
      const item: DialogState = {
        mode,
        tone: mode === 'confirm' ? 'warning' : 'info',
        confirmLabel: mode === 'confirm' ? '확인' : '좋아요',
        cancelLabel: '취소',
        ...normalized,
        id: ++nextId.current,
        scope,
        resolve,
      };
      queue.current.push(item);
      if (queue.current.length === 1) setDialog(item);
    });
  }, [scope]);

  const value = useMemo<DialogContextValue>(() => ({
    notify: async (options) => {
      await openDialog('alert', options);
    },
    confirm: (options) => openDialog('confirm', options),
  }), [openDialog]);

  const closeDialog = (result: boolean) => {
    if (queue.current[0]?.id !== dialog?.id) return;
    const current = queue.current.shift();
    setDialog(queue.current[0] ?? null);
    current?.resolve(result);
  };

  const tone = dialog?.tone ?? 'info';
  const style = toneStyles[tone];
  const title = dialog?.title ?? style.title;

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <ModalFrame key={dialog.id} role="alertdialog" aria-labelledby={titleId} aria-describedby={messageId} onDismiss={() => closeDialog(false)}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 ${style.badge}`}>
                {dialog.mode === 'confirm' && tone === 'warning' ? <HelpCircle size={26} /> : style.icon}
              </div>
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-gray-100 hover:text-heading"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>

            <h2 id={titleId} className="mb-2 text-xl font-black text-heading">{title}</h2>
            <p id={messageId} className="whitespace-pre-line text-sm font-bold leading-6 text-muted">{dialog.message}</p>

            <div className={`mt-6 grid gap-3 ${dialog.mode === 'confirm' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {dialog.mode === 'confirm' && (
                <Button type="button" data-modal-autofocus variant="outline" onClick={() => closeDialog(false)}>
                  {dialog.cancelLabel}
                </Button>
              )}
              <Button type="button" data-modal-autofocus={dialog.mode === 'alert' || undefined} variant={style.button} onClick={() => closeDialog(true)}>
                {dialog.confirmLabel}
              </Button>
            </div>
        </ModalFrame>
      )}
    </DialogContext.Provider>
  );
};
