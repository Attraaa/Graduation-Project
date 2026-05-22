import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';
import Button from './Button';

type DialogTone = 'info' | 'success' | 'warning' | 'danger';

type DialogOptions = {
  title?: string;
  message: string;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogState = DialogOptions & {
  mode: 'alert' | 'confirm';
  resolve: (value: boolean) => void;
};

type DialogContextValue = {
  notify: (options: string | DialogOptions) => Promise<void>;
  confirm: (options: string | DialogOptions) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const toneStyles: Record<DialogTone, { icon: React.ReactNode; badge: string; title: string; button: 'primary' | 'secondary' | 'danger' | 'warning' }> = {
  info: {
    icon: <Info size={26} />,
    badge: 'bg-blue-50 text-[#1cb0f6] border-blue-100',
    title: '알림',
    button: 'secondary',
  },
  success: {
    icon: <CheckCircle2 size={26} />,
    badge: 'bg-green-50 text-[#26c281] border-green-100',
    title: '완료',
    button: 'primary',
  },
  warning: {
    icon: <AlertTriangle size={26} />,
    badge: 'bg-yellow-50 text-[#c69b00] border-yellow-100',
    title: '확인 필요',
    button: 'warning',
  },
  danger: {
    icon: <AlertTriangle size={26} />,
    badge: 'bg-red-50 text-[#ff4b4b] border-red-100',
    title: '주의',
    button: 'danger',
  },
};

const normalizeOptions = (options: string | DialogOptions): DialogOptions => {
  if (typeof options === 'string') return { message: options };
  return options;
};

export const DialogProvider = ({ children }: { children: React.ReactNode }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const openDialog = useCallback((mode: DialogState['mode'], options: string | DialogOptions) => {
    const normalized = normalizeOptions(options);
    return new Promise<boolean>((resolve) => {
      setDialog({
        mode,
        tone: mode === 'confirm' ? 'warning' : 'info',
        confirmLabel: mode === 'confirm' ? '확인' : '좋아요',
        cancelLabel: '취소',
        ...normalized,
        resolve,
      });
    });
  }, []);

  const value = useMemo<DialogContextValue>(() => ({
    notify: async (options) => {
      await openDialog('alert', options);
    },
    confirm: (options) => openDialog('confirm', options),
  }), [openDialog]);

  const closeDialog = (result: boolean) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  const tone = dialog?.tone ?? 'info';
  const style = toneStyles[tone];
  const title = dialog?.title ?? style.title;

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/35 px-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border-2 border-gray-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 ${style.badge}`}>
                {dialog.mode === 'confirm' && tone === 'warning' ? <HelpCircle size={26} /> : style.icon}
              </div>
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="닫기"
              >
                <X size={20} />
              </button>
            </div>

            <h2 className="mb-2 text-xl font-black text-gray-700">{title}</h2>
            <p className="whitespace-pre-line text-sm font-bold leading-6 text-gray-500">{dialog.message}</p>

            <div className={`mt-6 grid gap-3 ${dialog.mode === 'confirm' ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {dialog.mode === 'confirm' && (
                <Button type="button" variant="outline" onClick={() => closeDialog(false)}>
                  {dialog.cancelLabel}
                </Button>
              )}
              <Button type="button" variant={style.button} onClick={() => closeDialog(true)}>
                {dialog.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return context;
};
