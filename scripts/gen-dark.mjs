// ダークモードの上書き (src/dark.css) を、ライトの CSS から作る。
// 白っぽい背景・明るい色を暗い面に、暗い文字色を明るい文字色に置き換えた規則だけを書き出す。
// CSS を直したら `node scripts/gen-dark.mjs` で作り直す
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = ['src/styles.css', 'src/game.css', 'src/jobs.css', 'src/links.css', 'src/features.css', 'src/desktop.css']
const D = ":root[data-theme='dark']"
// ガラスの光沢 (白いハイライト) はそのまま残し、濃さだけ src/dark-tokens.css で下げる
const SKIP = new Set(['.glass::before', '.glass::after', '.composer::after'])

// ---------- 色 ----------
const hex = (h) => {
  h = h.slice(1)
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
}
const toHsl = ([r, g, b]) => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const hsla = (h, s, l, a) => `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${+a.toFixed(3)})`
const COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g
const parse = (c) => {
  if (c.startsWith('#')) return hex(c)
  const n = c.match(/[\d.]+/g).map(Number)
  return [n[0], n[1], n[2], n[3] ?? 1]
}
/** 背景: 明るい色 (白・淡い色) を暗い面に。白の半透明は暗い面の半透明に */
function darkBg(c) {
  const [r, g, b, a] = parse(c)
  const [h, s, l] = toHsl([r, g, b])
  if (l < 0.8) return null
  const alpha = a >= 0.95 ? 1 : 0.45 + a * 0.45
  return hsla(h, Math.min(s, 0.35), 0.12 + (1 - l) * 0.35, alpha)
}
/** 文字: 暗い色を明るく */
function lightText(c) {
  const [r, g, b, a] = parse(c)
  const [h, s, l] = toHsl([r, g, b])
  if (l > 0.3) return null
  return hsla(h, s, 0.9 - l, a)
}
const swap = (value, fn) => {
  let changed = false
  const out = value.replace(COLOR, (c) => {
    const x = fn(c)
    if (x) changed = true
    return x ?? c
  })
  return changed ? out : null
}

// ---------- CSS をざっくり分解 (規則とその中の宣言、@media の入れ子) ----------
function* rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open < 0) return
    const head = css.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (depth && j < css.length) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const body = css.slice(open + 1, j - 1)
    if (head.startsWith('@media') || head.startsWith('@supports')) yield { media: head, body }
    else if (!head.startsWith('@')) yield { selector: head, body }
    i = j
  }
}
const decls = (body) =>
  body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const k = d.indexOf(':')
      return [d.slice(0, k).trim(), d.slice(k + 1).trim()]
    })

const prefix = (sel) =>
  sel
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s.startsWith(':root') ? s.replace(':root', D) : s.startsWith('html') ? s.replace('html', `html${D.slice(5)}`) : `${D} ${s}`))
    .join(', ')

function convert(css) {
  const out = []
  for (const r of rules(css)) {
    if (r.media) {
      const inner = convert(r.body)
      if (inner) out.push(`${r.media} {\n${inner}\n}`)
      continue
    }
    // 称号のチップは金属・虹の色なので、ダークでも同じ色のまま
    if (SKIP.has(r.selector) || r.selector.includes('.title-chip')) continue
    const changed = []
    for (const [k, v] of decls(r.body)) {
      if (k === 'background' || k === 'background-color' || k === 'background-image' || k === '--glass' || k === 'fill') {
        const x = swap(v, darkBg)
        if (x) changed.push(`${k}: ${x}`)
      } else if (k === 'color' || k === 'border-color' || k === 'stroke') {
        const x = swap(v, lightText)
        if (x) changed.push(`${k}: ${x}`)
      }
    }
    if (changed.length) out.push(`${prefix(r.selector)} { ${changed.join('; ')}; }`)
  }
  return out.join('\n')
}

const parts = FILES.map((f) => `/* ---- ${f} ---- */\n${convert(readFileSync(f, 'utf8'))}`)
writeFileSync(
  'src/dark.css',
  `/* ダークモード (自動生成: node scripts/gen-dark.mjs。手で直すときは src/dark-tokens.css へ) */\n${parts.join('\n\n')}\n`,
)
console.log('src/dark.css written')
