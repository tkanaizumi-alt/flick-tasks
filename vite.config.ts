import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [react(), cloudflare()],
  // 開発時に依存の再最適化でリロードが詰まらないよう事前バンドル対象を固定
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime', 'motion/react'],
  },
})
