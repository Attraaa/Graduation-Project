export {}

declare global {
  interface Window {
    motiWindow?: { setTheme: (theme: 'light' | 'dark') => Promise<void> }
    motiKeyboard?: {
      start: (external?: boolean) => Promise<{ origin: string; token: string }>
      stop: () => Promise<void>
      settings: () => Promise<{ apps: { name: string; path: string }[]; stopShortcut: string }>
      chooseApp: () => Promise<{ apps: { name: string; path: string }[]; stopShortcut: string }>
      updateSettings: (input: { removePath?: string; stopShortcut?: string }) => Promise<{ apps: { name: string; path: string }[]; stopShortcut: string }>
      onHalt: (listener: () => void) => () => void
    }
  }
}
