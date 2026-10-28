// API の通しテスト。ローカルの開発サーバー (npm run dev、.dev.vars に DEV_LOGIN=1) に対して実行する
//   npm run test:e2e            → http://localhost:5173
//   npm run test:e2e -- <URL>   → 別のローカル URL
// 開発用ログイン (/auth/dev?as=1, 2) の 2 人で操作し、作ったタスクは最後に消す
const base = process.argv[2] ?? 'http://localhost:5173'
const PREFIX = 'E2E-AUTO'

// 本番など開発用ログインが使えない環境では、確認用のセッションを E2E_TOKEN_A / E2E_TOKEN_B で渡す
function client(token) {
  let cookie = token ? `flick_sid=${token}` : ''
  const call = async (path, method = 'GET', body) => {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(base + path, {
        method,
        redirect: 'manual',
        headers: { cookie, 'content-type': 'application/json', origin: base },
        body: body && JSON.stringify(body),
      })
      const set = r.headers.get('set-cookie')
      if (set) cookie = set.split(';')[0]
      // ローカルの開発サーバーはまれに 500 (fetch failed) を返すので少し待って再試行
      if (r.status >= 500 && i < 3) {
        await new Promise((ok) => setTimeout(ok, 500))
        continue
      }
      const text = await r.text()
      try {
        return { status: r.status, ...JSON.parse(text) }
      } catch {
        return { status: r.status }
      }
    }
  }
  return { call, login: (n) => (token ? null : call(`/auth/dev?as=${n}`)) }
}

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${JSON.stringify(detail)?.slice(0, 200)}`}`)
}

const A = client(process.env.E2E_TOKEN_A)
const B = client(process.env.E2E_TOKEN_B)
await A.login(1)
await B.login(2)
const meA = (await A.call('/api/me')).user
const meB = (await B.call('/api/me')).user
check('ログイン (2 人)', meA?.id && meB?.id && meA.id !== meB.id, { meA, meB })

// タスクの追加・重要度・並べ替え
const [t1, t2, t3] = (await A.call('/api/tasks', 'POST', { tasks: [1, 2, 3].map((i) => ({ title: `${PREFIX} ${i} #e2e` })) })).tasks
check('タスクの追加', !!t3, t3)
check('重要度', (await A.call(`/api/tasks/${t1.id}`, 'PATCH', { priority: 'high' })).task?.priority === 'high')
check('ありえない重要度は断る', (await A.call(`/api/tasks/${t1.id}`, 'PATCH', { priority: 'urgent' })).status === 400)
await A.call('/api/tasks/reorder', 'POST', { ids: [t3.id, t1.id, t2.id] })
const order = (await A.call('/api/tasks')).tasks.filter((t) => t.title.startsWith(PREFIX)).sort((a, b) => b.position - a.position).map((t) => t.id)
check('手動の並べ替え', JSON.stringify(order.slice(0, 3)) === JSON.stringify([t3.id, t1.id, t2.id]), order)

// 状況フラグ・依頼・通知
check('確認待ち', (await A.call(`/api/tasks/${t1.id}/flag`, 'PUT', { flag: 'wait', to: meB.id })).task?.flag?.to?.id === meB.id)
const req = await A.call('/api/requests', 'POST', { to: meB.id, title: `${PREFIX} 依頼`, followId: t2.id })
check('依頼', req.status === 201 && req.task.requestedBy?.id === meA.id, req)
const noticesB = await B.call('/api/notifications')
check('依頼の通知', noticesB.notices?.some((n) => n.kind === 'request'), noticesB.notices?.map((n) => n.kind))
await B.call(`/api/tasks/${req.task.id}`, 'PATCH', { status: 'done' })
check('依頼の完了 → 後続タスクに反映', (await A.call('/api/tasks')).tasks.find((t) => t.id === t2.id)?.waitingOn?.status === 'done')

// 他の人のタスクを動かす・手伝い XP (1 回だけ)
const tb = (await B.call('/api/tasks', 'POST', { tasks: [{ title: `${PREFIX} B の仕事` }] })).tasks[0]
const moved = await A.call(`/api/tasks/${tb.id}/move`, 'POST', { status: 'done' })
check('他の人のタスクを完了に', moved.task?.status === 'done' && moved.xp?.amount > 0, moved)
await B.call(`/api/tasks/${tb.id}`, 'PATCH', { status: 'todo' })
check('手伝い XP は 1 回だけ', (await A.call(`/api/tasks/${tb.id}/move`, 'POST', { status: 'done' })).xp === null)
check('自分のタスクは move できない', (await A.call(`/api/tasks/${t3.id}/move`, 'POST', { status: 'done' })).status === 400)

// コメント
await B.call(`/api/tasks/${t1.id}/comments`, 'POST', { text: 'E2E コメント' })
const cm = await A.call(`/api/tasks/${t1.id}/comments`)
check('コメント', cm.comments?.some((c) => c.text === 'E2E コメント' && !c.mine), cm)
check('コメントの通知', (await A.call('/api/notifications')).notices?.some((n) => n.kind === 'comment'))
check('一覧にコメント数', (await A.call('/api/tasks')).tasks.find((t) => t.id === t1.id)?.comments === 1)

// 繰り返し
const rec = await A.call(`/api/tasks/${t3.id}/recurring`, 'POST', { rule: 'daily' })
check('繰り返しにする', rec.task?.recurring?.rule === 'daily', rec)
check('今日の分は二重に作らない', (await A.call('/api/tasks')).tasks.filter((t) => t.title === t3.title).length === 1)
check('ありえないルールは断る', (await A.call(`/api/tasks/${t3.id}/recurring`, 'POST', { rule: 'weekly:9' })).status === 400)
await A.call(`/api/recurring/${rec.task.recurring.id}`, 'DELETE')

// 履歴・実績
await A.call(`/api/tasks/${t1.id}`, 'PATCH', { status: 'done' })
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
check('履歴', (await A.call(`/api/history?from=${today}&to=${today}`)).tasks?.some((t) => t.id === t1.id))
const pl = await A.call('/api/player')
check('実績の集計', typeof pl.stats?.done === 'number' && Array.isArray(pl.player?.achievements), pl.stats)
const first = pl.player.achievements.find((a) => a.id === 'first')
check('称号の設定', !first || (await A.call('/api/player/title', 'POST', { title: 'first' })).player?.title === 'first')
check('取っていない称号は断る', (await A.call('/api/player/title', 'POST', { title: 'stage30' })).status === 400)
await A.call('/api/player/title', 'POST', { title: null })

// ゲームの追加要素: レイド・MVP・イベント・ペット・ショップ・強化
const raid = await A.call('/api/raid')
check('レイド', raid.boss?.hp > 0 && raid.ranking?.some((p) => p.id === meA.id) && raid.mine > 0, raid)
const mvp = await A.call('/api/mvp')
check('先週の MVP', mvp.status === 200 && typeof mvp.week === 'string', mvp)
check('季節イベント', (await A.call('/api/event')).status === 200)
check('仲間になっていないペットは断る', (await A.call('/api/player/pet', 'POST', { pet: 'bird' })).status === 400)
const before = (await A.call('/api/player')).player
if (before.gold >= 200) {
  const b = await A.call('/api/shop/boost', 'POST', {})
  check('XP2倍チケット', b.player?.boostLeft === (before.boostLeft ?? 0) + 3 && b.player.gold === before.gold - 200, b.player)
  const tx = (await A.call('/api/tasks', 'POST', { tasks: [{ title: `${PREFIX} 2倍` }] })).tasks[0]
  const d = await A.call(`/api/tasks/${tx.id}`, 'PATCH', { status: 'done' })
  check('XP2倍が効く', d.xp?.bonuses?.includes('🎫XP2倍'), d.xp)
} else {
  check('お金が足りないと買えない', (await A.call('/api/shop/boost', 'POST', {})).status === 400)
}
const sameKind = Object.values(
  before.items.reduce((m, i) => ((m[`${i.slot}/${i.rarity}`] ??= []).push(i), m), {}),
).find((list) => list.length >= 2)
if (sameKind) {
  const target = sameKind.find((i) => (i.plus ?? 0) < 5)
  if (target) {
    const e = await A.call(`/api/items/${target.id}/enhance`, 'POST', {})
    check('装備の強化', e.player?.items.find((i) => i.id === target.id)?.plus === (target.plus ?? 0) + 1, e)
  }
}

// ゴールドの使い道: 持ち物の枠・スキン・ゴールドで強化・差し入れ (お金が足りないときは断られることを確かめる)
const now = async () => (await A.call('/api/player')).player
check('買っていないスキンは着られない', (await A.call('/api/player/skin', 'POST', { skin: 'crown' })).status === 400)
check('売っていないスキンは買えない', (await A.call('/api/shop/skin/rabbit', 'POST', {})).status === 400)
let g = await now()
const bagCost = 300 * (Math.floor((g.invExtra ?? 0) / 10) + 1)
if ((g.invExtra ?? 0) >= 30) check('持ち物の枠は +30 まで', (await A.call('/api/shop/bag', 'POST', {})).status === 400)
else if (g.gold >= bagCost) {
  const r = await A.call('/api/shop/bag', 'POST', {})
  check('持ち物の枠 +10', r.player?.invExtra === (g.invExtra ?? 0) + 10 && r.player.gold === g.gold - bagCost, r.player)
} else check('お金が足りないと枠を買えない', (await A.call('/api/shop/bag', 'POST', {})).status === 400)
g = await now()
if (g.ownedSkins?.includes('ghost')) check('買ったスキンは二度買えない', (await A.call('/api/shop/skin/ghost', 'POST', {})).status === 400)
else if (g.gold >= 300) {
  const r = await A.call('/api/shop/skin/ghost', 'POST', {})
  check('スキンを買う', r.player?.ownedSkins?.includes('ghost') && r.player.skin === 'ghost' && r.player.gold === g.gold - 300, r.player)
  check('買ったスキンは二度買えない', (await A.call('/api/shop/skin/ghost', 'POST', {})).status === 400)
} else check('お金が足りないとスキンを買えない', (await A.call('/api/shop/skin/ghost', 'POST', {})).status === 400)
g = await now()
const cheap = g.items.find((i) => (i.plus ?? 0) < 5)
if (cheap) {
  const cost = { N: 30, R: 60, SR: 120, SSR: 250, UR: 500 }[cheap.rarity] * ((cheap.plus ?? 0) + 1)
  const r = await A.call(`/api/items/${cheap.id}/enhance`, 'POST', { by: 'gold' })
  if (g.gold >= cost) check('ゴールドで強化', r.player?.items.find((i) => i.id === cheap.id)?.plus === (cheap.plus ?? 0) + 1 && r.player.gold === g.gold - cost, r)
  else check('お金が足りないとゴールドで強化できない', r.status === 400, r)
}
// 差し入れは本当のメンバーにもゴールドが配られるので、ローカルだけで試す
if (!process.env.E2E_TOKEN_A) {
  g = await now()
  const b0 = (await B.call('/api/player')).player
  if (g.treated) check('差し入れは1日1回', (await A.call('/api/shop/treat', 'POST', {})).status === 400)
  else if (g.gold >= 300) {
    const r = await A.call('/api/shop/treat', 'POST', {})
    const b1 = (await B.call('/api/player')).player
    const note = (await B.call('/api/notifications')).notices?.find((n) => n.kind === 'treat')
    check('みんなに差し入れ', r.player?.treated && r.player.gold === g.gold - 300 && b1.gold === b0.gold + 30 && !!note, { r: r.player?.gold, b0: b0.gold, b1: b1.gold, note })
    check('差し入れは1日1回', (await A.call('/api/shop/treat', 'POST', {})).status === 400)
  }
}

// @名前 のコメント・お知らせのさかのぼり・エラーの報告・管理者の集計
await A.call(`/api/tasks/${t2.id}/comments`, 'POST', { text: `@${meB.name} 確認お願いします` })
const mentionB = (await B.call('/api/notifications')).notices?.find((n) => n.kind === 'comment' && n.text.includes('あなた宛て'))
check('@名前 で相手に通知', !!mentionB && mentionB.taskOwner === meA.id, mentionB)
const page1 = await B.call('/api/notifications')
check('お知らせのさかのぼり', typeof page1.more === 'boolean' && (await B.call(`/api/notifications?before=${page1.notices.at(-1)?.createdAt ?? Date.now()}`)).status === 200)
check('画面のエラーの報告', (await A.call('/api/log', 'POST', { message: `${PREFIX} テスト用のエラー`, path: '/e2e' })).ok === true)
const stats = await A.call('/api/admin/stats')
check('集計は管理者だけ', meA.isAdmin ? stats.people?.length > 0 : stats.status === 403, stats.status)

// テンプレート・カレンダー配信・完了タスクの検索・利用の記録・バックアップ
const tpl = await A.call('/api/templates', 'POST', { name: `${PREFIX} 月末`, items: ['請求書を発行する', ' ', '経費精算を締める'] })
check('テンプレートを作る', tpl.template?.items?.length === 2, tpl)
check('テンプレートの一覧', (await A.call('/api/templates')).templates?.some((t) => t.id === tpl.template?.id))
check('名前のないテンプレートは断る', (await A.call('/api/templates', 'POST', { name: ' ', items: ['a'] })).status === 400)
check('他の人のテンプレートは見えない', !(await B.call('/api/templates')).templates?.some((t) => t.id === tpl.template?.id))
await A.call(`/api/templates/${tpl.template?.id}`, 'DELETE')
check('テンプレートを消す', !(await A.call('/api/templates')).templates?.some((t) => t.id === tpl.template?.id))

// ログインなしで読む URL (開発サーバーはまれに 500 を返すので再試行)
const raw = async (url) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url)
    if (r.status < 500 || i >= 3) return r
    await new Promise((ok) => setTimeout(ok, 500))
  }
}
const due = (await A.call('/api/tasks', 'POST', { tasks: [{ title: `${PREFIX} 期限つき, カレンダー; 確認` }] })).tasks[0]
await A.call(`/api/tasks/${due.id}/due`, 'PUT', { due: '2030-01-15' })
const cal = await A.call('/api/calendar', 'POST', {})
const ics = await raw(cal.url).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), text: await r.text() }))
check(
  'カレンダー配信',
  ics.status === 200 && ics.type?.startsWith('text/calendar') && ics.text.includes('BEGIN:VCALENDAR') && ics.text.includes('DTSTART;VALUE=DATE:20300115') && ics.text.includes('期限つき\\, カレンダー\\; 確認'),
  { status: ics.status, text: ics.text.slice(0, 300) },
)
const cal2 = await A.call('/api/calendar', 'POST', {})
check('作り直すと前の URL は使えない', cal2.url !== cal.url && (await raw(cal.url)).status === 404)
await A.call('/api/calendar', 'DELETE')
check('表示を止める', (await raw(cal2.url)).status === 404 && (await A.call('/api/calendar')).url === null)

const word = `検索${Date.now().toString(36)}`
const found = (await A.call('/api/tasks', 'POST', { tasks: [{ title: `${PREFIX} ${word} 100%` }] })).tasks[0]
await A.call(`/api/tasks/${found.id}`, 'PATCH', { status: 'done' })
const hit = await A.call(`/api/history/search?q=${encodeURIComponent(word)}`)
check('完了タスクの検索', hit.tasks?.length === 1 && hit.tasks[0].id === found.id, hit)
const pct = await A.call(`/api/history/search?q=${encodeURIComponent('%')}`)
check('検索の % はそのままの文字として扱う', pct.tasks?.every((t) => t.title.includes('%') || t.note.includes('%')), pct.tasks?.length)
check('他の人の完了タスクは出ない', (await B.call(`/api/history/search?q=${encodeURIComponent(word)}`)).tasks?.length === 0)

check('画面からの利用の記録', (await A.call('/api/usage', 'POST', { feature: 'csv' })).ok === true)
check('知らない機能名は断る', (await A.call('/api/usage', 'POST', { feature: 'hack' })).status === 400)
if (meA.isAdmin) {
  const st = await A.call('/api/admin/stats')
  check('集計: 機能の使われ方', st.features?.find((f) => f.id === 'search')?.n > 0 && st.features.some((f) => f.n === 0), st.features?.slice(0, 3))
  check('集計: ゴールドの流れ', Array.isArray(st.goldFlow) && typeof st.people[0]?.goldIn7 === 'number')
  const bk = await A.call('/api/admin/backups', 'POST', {})
  const list = await A.call('/api/admin/backups')
  check('バックアップ', bk.ok && list.backups?.length > 0, { bk, list })
  const one = await A.call(`/api/admin/backups/${list.backups?.[0]?.day}`)
  check('バックアップの中身', one.app === 'flick' && Array.isArray(one.tables?.tasks) && !('sessions' in one.tables), Object.keys(one.tables ?? {}))
} else {
  check('バックアップは管理者だけ', (await A.call('/api/admin/backups')).status === 403)
}

// 後片付け
for (const c of [A, B]) {
  const { tasks } = await c.call('/api/tasks')
  for (const t of tasks.filter((t) => t.title.startsWith(PREFIX))) await c.call(`/api/tasks/${t.id}`, 'DELETE')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 件 合格`)
process.exit(failed.length ? 1 : 0)
