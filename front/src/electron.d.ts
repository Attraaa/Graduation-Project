export {}

declare global {
  interface Window {
    motiKeyboard?: {
      start: () => Promise<{ origin: string; token: string }>
      stop: () => Promise<void>
    }
  }
}
