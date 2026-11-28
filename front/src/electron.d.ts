import type { SystemNotificationRequest, SystemNotificationResult } from './features/notifications/contract'
import type { OverlayCommand, OverlayMode, OverlayResult, OverlaySnapshot, OverlayView } from './features/overlay/contract'
import type { DesktopApi } from './utils/desktopApiContract'

declare global {
  interface Window {
    motiApi?: DesktopApi
    motiOverlay?: {
      state: () => Promise<OverlayView>
      ready: () => Promise<void>
      onState: (listener: (state: OverlayView) => void) => () => void
      command: (command: OverlayCommand) => Promise<OverlayResult>
      back: (mode?: OverlayMode) => Promise<void>
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
    motiWindow?: { setTheme: (theme: 'light' | 'dark', dimmed: boolean) => Promise<void> }
    /** Diagnostics log (electron/diagnostics.ts): a one-minute sample and unhandled errors. Main window only. */
    motiDiagnostics?: { sample: (value: unknown) => void; error: (value: unknown) => void }
    motiKeyboard?: {
      start: (external?: boolean) => Promise<{ origin: string; token: string }>
      stop: () => Promise<void>
      settings: () => Promise<{ apps: { name: string; path: string }[] }>
      chooseApp: () => Promise<{ apps: { name: string; path: string }[] }>
      updateSettings: (input: { removePath?: string }) => Promise<{ apps: { name: string; path: string }[] }>
      /** Programs with a window now (file description as `title`, icon as a data URL). */
      openApps: () => Promise<{ name: string; path: string; title: string; approved: boolean; icon: string | null }[]>
      /** Approves one program from the last `openApps` list; other paths are refused. */
      approveOpenApp: (path: string) => Promise<{ apps: { name: string; path: string }[] }>
      onHalt: (listener: () => void) => () => void
    }
  }
}
