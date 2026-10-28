import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { api, HttpError } from './api'
import { reloadForNewVersion } from './reload'
import './styles.css'
import './game.css'
import './jobs.css'
import './links.css'
import './features.css'
import './desktop.css'
import './dark-tokens.css'
import './dark.css'

const sent = new Set<string>()
const report = (message: string, stack?: string) => {
  if (!message || sent.has(message) || sent.size >= 5) return
  sent.add(message)
  api.log(message, stack).catch(() => {})
}
// 新しい版の公開後、古い画面の部品が読めなかったときは読み直す (エラーとしては記録しない)
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadForNewVersion()
})
const STALE = /dynamically imported module|valid JavaScript MIME type|Importing a module script failed/i
window.addEventListener('error', (e) => {
  if (STALE.test(String(e.message)) && reloadForNewVersion()) return
  report(String(e.message), e.error?.stack)
})
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  // 通信の失敗 (オフラインなど) は記録しない
  if (r instanceof HttpError || /fetch|network/i.test(String(r?.message ?? ''))) return
  if (STALE.test(String(r?.message ?? '')) && reloadForNewVersion()) return
  report(String(r?.message ?? r), r?.stack)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
