import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { MODAL_VISIBILITY_EVENT } from './modalEvents';

/** Native modal isolation also covers keyboard focus and nested dialogs. */
export default function ModalFrame({ children, onDismiss, returnFocus, className = '', ...label }: {
  children: ReactNode;
  onDismiss: () => void;
  returnFocus?: () => HTMLElement | null;
  className?: string;
  role?: 'dialog' | 'alertdialog';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const focusAfterClose = useRef(returnFocus);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    const getReturnTarget = focusAfterClose.current;
    dialog.showModal();
    document.dispatchEvent(new Event(MODAL_VISIBILITY_EVENT));
    dialog.querySelector<HTMLElement>('[data-modal-autofocus], [autofocus], input:not([disabled]), button[type="submit"]')?.focus();
    return () => {
      dialog.close();
      document.dispatchEvent(new Event(MODAL_VISIBILITY_EVENT));
      const target = getReturnTarget?.();
      if (target?.isConnected) target.focus({ preventScroll: true });
      else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={ref} role="dialog" aria-modal="true" {...label}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    className={`app-modal rounded-3xl border-2 border-border bg-surface p-6 text-heading shadow-2xl ${className}`}>
    {children}
  </dialog>;
}
