import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { api, HttpError } from './api'
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
window.addEventListener('error', (e) => report(String(e.message), e.error?.stack))
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason
  // 通信の失敗 (オフラインなど) は記録しない
  if (r instanceof HttpError || /fetch|network/i.test(String(r?.message ?? ''))) return
  report(String(r?.message ?? r), r?.stack)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
