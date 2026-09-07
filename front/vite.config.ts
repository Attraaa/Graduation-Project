import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  cacheDir: './.vite-cache-screenshots',
  plugins: [
    tailwindcss(),
    react(),
    ...(mode === 'browser' ? [] : electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            lib: false,
            rollupOptions: { input: 'electron/preload.ts', output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
          },
        },
      },
    ])),
  ],
}))
