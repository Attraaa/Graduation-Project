import type { DisplayInfo } from './features/dual-monitor/layout'

declare global {
  interface Window {
    motiWindow?: { setTheme: (theme: 'light' | 'dark') => Promise<void> }
    motiDisplays?: {
      list: () => Promise<DisplayInfo[]>
      showTarget: (displayId: string) => Promise<void>
      hideTarget: () => Promise<void>
      onChanged: (listener: () => void) => () => void
    }
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
