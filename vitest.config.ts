import { defineConfig } from 'vitest/config'

// 単体テストは共通ロジック (shared/) だけなので、アプリの Vite 設定 (Cloudflare プラグイン) は読み込まない
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
