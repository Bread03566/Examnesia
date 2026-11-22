import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const NATIVE_CSP =
  "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'self' https:; img-src 'self' data:; style-src 'self' 'unsafe-inline'"

function nativeCspPlugin(mode) {
  const isNative = mode === 'native' || process.env.VITE_PLATFORM === 'native'
  return {
    name: 'kabisado-native-csp',
    transformIndexHtml(html) {
      if (!isNative) return html
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${NATIVE_CSP}" />\n`
      return html.replace('<meta name="viewport"', `${meta}    <meta name="viewport"`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  define: mode === 'native' ? { 'import.meta.env.VITE_PLATFORM': JSON.stringify('native') } : {},
  plugins: [
    react(),
    tailwindcss(),
    nativeCspPlugin(mode),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
