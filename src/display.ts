/** 文字の大きさ・シンプル表示 (この端末に保存。index.html でも最初の描画前に読む) */
export type FontSize = 's' | 'm' | 'l' | 'xl'
export const FONT_KEY = 'flick.font'
export const SIMPLE_KEY = 'flick.simple'
/** 画面全体の拡大率 */
export const FONT_ZOOM: Record<FontSize, number> = { s: 0.92, m: 1, l: 1.12, xl: 1.25 }
export const FONT_LABEL: Record<FontSize, string> = { s: '小', m: '標準', l: '大', xl: '特大' }
export const NEXT_FONT: Record<FontSize, FontSize> = { s: 'm', m: 'l', l: 'xl', xl: 's' }
