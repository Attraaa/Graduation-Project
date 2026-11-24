import type { SystemNotificationRequest, SystemNotificationResult } from './features/notifications/contract'
import type { OverlayCommand, OverlayResult, OverlaySnapshot, OverlayView } from './features/overlay/contract'

declare global {
  interface Window {
    motiOverlay?: {
      state: () => Promise<OverlayView>
      ready: () => Promise<void>
      onState: (listener: (state: OverlayView) => void) => () => void
      command: (command: OverlayCommand) => Promise<OverlayResult>
      back: () => Promise<void>
    }
    motiDesktop?: {
      publish: (snapshot: OverlaySnapshot | null) => void
      open: () => Promise<void>
      onCommand: (listener: (command: OverlayCommand) => OverlayResult) => () => void
      onNavigate: (listener: (target: string) => void) => () => void
    }
    motiNotifications?: {
      show: (input: SystemNotificationRequest) => Promise<SystemNotificationResult>
      clear: (kind?: SystemNotificationRequest['kind']) => Promise<void>
      configure: (enabled: boolean) => Promise<void>
      presentation: () => Promise<{ overlay: boolean; automaticAllowed: boolean }>
      onPresentation: (listener: (value: { overlay: boolean; automaticAllowed: boolean }) => void) => () => void
    }
    motiWindow?: { setTheme: (theme: 'light' | 'dark') => Promise<void> }
    /** Diagnostics log (electron/diagnostics.ts): a one-minute sample and unhandled errors. Main window only. */
    motiDiagnostics?: { sample: (value: unknown) => void; error: (value: unknown) => void }
    motiKeyboard?: {
      start: (external?: boolean) => Promise<{ origin: string; token: string }>
      stop: () => Promise<void>
      settings: () => Promise<{ apps: { name: string; path: string }[] }>
      chooseApp: () => Promise<{ apps: { name: string; path: string }[] }>
      updateSettings: (input: { removePath?: string }) => Promise<{ apps: { name: string; path: string }[] }>
      onHalt: (listener: () => void) => () => void
    }
  }
}
