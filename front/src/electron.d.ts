export {}

declare global {
  interface Window {
    motiWindow?: { setTheme: (theme: 'light' | 'dark') => Promise<void> }
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
