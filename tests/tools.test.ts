import { describe, expect, it } from 'vitest'
import { toIcs } from '../worker/calendar'
import { featureOf } from '../worker/usage'
import { CLIENT_FEATURES, FEATURES } from '../shared/usage'

describe('カレンダー配信', () => {
  const ics = toIcs([{ id: 't1', title: '見積書, 送付; 確認', note: '1行目\n2行目', due_date: '2026-12-31', updated_at: Date.UTC(2026, 9, 28) }], 'https://example.test')
  it('終日の予定 (翌日まで)、改行は CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
    expect(ics).toContain('UID:t1@flick')
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
  })
  it('カンマ・セミコロン・改行はエスケープ', () => {
    expect(ics).toContain('SUMMARY:⏰ 見積書\\, 送付\\; 確認')
    expect(ics).toContain('1行目\\n2行目')
  })
  it('長い行は 75 バイトで折り返す', () => {
    const long = toIcs([{ id: 't2', title: 'あ'.repeat(60), note: '', due_date: '2026-01-01', updated_at: 0 }], 'https://example.test')
    const enc = new TextEncoder()
    expect(long.split('\r\n').every((l) => enc.encode(l).length <= 75)).toBe(true)
    // 折り返しを戻すと元の件名
    expect(long.replace(/\r\n /g, '')).toContain(`SUMMARY:⏰ ${'あ'.repeat(60)}`)
  })
})

describe('機能の使われ方の記録', () => {
  it('操作から機能名', () => {
    expect(featureOf('POST', '/tasks')).toBe('task_add')
    expect(featureOf('PATCH', '/tasks/abc')).toBe('task_edit')
    expect(featureOf('POST', '/shop/bag')).toBe('shop_bag')
    expect(featureOf('POST', '/shop/skin/ghost')).toBe('skin_buy')
    expect(featureOf('GET', '/history/search')).toBe('search')
    expect(featureOf('GET', '/tasks')).toBeNull()
  })
  it('記録する機能には集計用の名前がある', () => {
    for (const f of ['task_add', 'task_done', 'enhance_gold', 'shop_treat', 'treat_received', 'calendar', ...CLIENT_FEATURES]) expect(FEATURES[f]).toBeTruthy()
  })
})
