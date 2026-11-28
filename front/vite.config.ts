import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const base = loadEnv(mode, process.cwd(), 'VITE_MOTI_').VITE_MOTI_API_URL;
  const reviewTestToken = command === 'serve'
    ? loadEnv(mode, process.cwd(), 'MOTI_DAILY_REVIEW_TEST_').MOTI_DAILY_REVIEW_TEST_TOKEN
    : undefined;
  let appPolicy = ''
  if (command === 'build' && mode !== 'browser') {
    const url = URL.canParse(base ?? '') ? new URL(base) : null;
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Windows/macOS 배포 빌드는 VITE_MOTI_API_URL에 HTTPS 서버 주소가 필요합니다.');
    }
    appPolicy = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "frame-src 'self'",
      "worker-src 'self' blob:",
      "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ].join('; ')
  }
  return ({
  base: './',
  define: { 'import.meta.env.MOTI_DAILY_REVIEW_TEST': JSON.stringify(!!reviewTestToken) },
  server: reviewTestToken ? {
    proxy: {
      '^/__moti_daily_review$': {
        target: 'http://127.0.0.1:39816',
        changeOrigin: true,
        rewrite: () => '/api/ai/review',
        headers: { Authorization: `Bearer ${reviewTestToken}` },
      },
    },
  } : undefined,
  cacheDir: './.vite-cache-screenshots',
  build: { rollupOptions: { input: { index: 'index.html', overlay: 'overlay.html' } } },
  // ONNX Runtime Web finds its wasm next to its own module; pre-bundling would move the module away from it.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  plugins: [
    {
      name: 'moti-desktop-policy',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          if (!appPolicy || context.path !== '/index.html') return html
          return { html, tags: [{ tag: 'meta', injectTo: 'head-prepend',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: appPolicy } }] }
        },
      },
    },
    tailwindcss(),
    react(),
    ...(mode === 'browser' ? [] : electron([
      {
        // Main-Process entry file of the Electron App.
        entry: 'electron/main.ts',
        vite: { define: { MOTI_DESKTOP_API_BASE: JSON.stringify(base ?? '') } },
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
  })
})
