import { trackUsage } from './api'
import { useCallback, useEffect, useState } from 'react'
import type { View } from './components/Dock'

/** 見え方: 自動 (画面の幅で決める) / スマホ / PC。画面 (自分・みんな・冒険) ごとに選べる */
export type LayoutMode = 'auto' | 'mobile' | 'pc'
export type Layouts = Record<View, LayoutMode>

const KEY = 'flick.layout'
const CAL_KEY = 'flick.layout.calendar'
/** 自動のとき PC 表示にする幅 */
const PC_QUERY = '(min-width: 1000px)'
/** 切り替えボタンを出す幅 (これより狭いスマホでは PC 表示は使えないので出さない) */
const TOGGLE_QUERY = '(min-width: 768px)'

export function useMedia(query: string) {
  const [on, setOn] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [query])
  return on
}

const read = (): Layouts => {
  const base: Layouts = { me: 'auto', people: 'auto', game: 'auto' }
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    for (const k of Object.keys(base) as View[]) if (v[k] === 'mobile' || v[k] === 'pc') base[k] = v[k]
  } catch {}
  return base
}

/** 画面ごとの見え方。isPc(view) でその画面を PC 表示にするかを返す */
export function useLayouts() {
  const [layouts, setLayouts] = useState<Layouts>(read)
  const wideScreen = useMedia(PC_QUERY)
  const canToggle = useMedia(TOGGLE_QUERY)
  const isPc = useCallback((v: View) => canToggle && (layouts[v] === 'pc' || (layouts[v] === 'auto' && wideScreen)), [layouts, wideScreen, canToggle])
  const setLayout = useCallback((v: View, mode: 'mobile' | 'pc') => {
    trackUsage('layout')
    setLayouts((prev) => {
      const next = { ...prev, [v]: mode }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  // 「自分」のカレンダー表示 (この端末に保存。スマホ・PC の見え方とは別に覚える)
  const [calendar, setCalendarState] = useState(() => {
    try {
      return localStorage.getItem(CAL_KEY) === '1'
    } catch {
      return false
    }
  })
  const setCalendar = useCallback((on: boolean) => {
    if (on) trackUsage('calendar_view')
    setCalendarState(on)
    try {
      localStorage.setItem(CAL_KEY, on ? '1' : '0')
    } catch {}
  }, [])
  return { isPc, setLayout, canToggle, calendar, setCalendar }
}
