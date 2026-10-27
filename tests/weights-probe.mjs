// AI の作業量判定 (小・中・大・特大) の確認用。ローカルの開発サーバー (DEV_LOGIN=1) で
//   node tests/weights-probe.mjs [URL]
// 期待とずれたものに ✗ を付ける。作ったタスクは最後に消す
const base = process.argv[2] ?? 'http://localhost:5173'
const CASES = [
  // 特大: 部署・会社をまたぐ、数週間〜数か月かかる案件 (短い件名でも)
  ['全社就業規則見直し', 'XL'],
  ['省力化補助金', 'XL'],
  ['CDO事業計画', 'XL'],
  ['弥生販売システム移管', 'XL'],
  ['人事評価制度の刷新', 'XL'],
  ['基幹システムのクラウド移行', 'XL'],
  ['新卒採用計画', 'XL'],
  // 大: 半日〜数日
  ['新人研修の資料作成', 'L'],
  ['取締役会の議案資料を作る', 'L'],
  ['四半期の売上分析レポート', 'L'],
  // 中: 1〜2 時間
  ['週次報告をまとめる', 'M'],
  ['見積書を作成する', 'M'],
  ['会議の議事録をまとめる', 'M'],
  // 小: 15 分以内 (大きな案件の一部でも、その作業自体が小さければ小)
  ['会議室を予約する', 'S'],
  ['お礼メールを送る', 'S'],
  ['補助金の申請書をコピーして回覧する', 'S'],
  ['就業規則の誤字を1か所直す', 'S'],
  ['弥生販売に得意先を1件登録する', 'S'],
  // ここから下は指示 (プロンプト) の例に入れていない「初見」のタスク
  // 案件の中の 1 つの作業・締切付きの申請・イベント準備は特大にしない
  ['IT導入補助金の申請', 'L'],
  ['ものづくり補助金の事務局への問い合わせ対応', 'L'],
  ['雇用調整助成金の申請書提出（11/30〆）', 'L'],
  ['秋祭りの出店準備', 'L'],
  ['防火管理者の届出を出す', 'M'],
  ['電子帳簿保存法への対応', 'XL'],
  ['ISO27001の認証取得', 'XL'],
  ['経理部門のDX推進', 'XL'],
  ['事業承継の準備', 'XL'],
  ['株主総会の想定問答集を作る', 'L'],
  ['新商品のプレスリリース原稿を作る', 'L'],
  ['来週の営業会議のアジェンダ作成', 'M'],
  ['取引先への請求書を発行する', 'M'],
  ['宅配便の集荷を手配する', 'S'],
  ['名刺を発注する', 'S'],
  ['経費精算の領収書を貼る', 'S'],
]
const ORDER = ['S', 'M', 'L', 'XL']

// 本番など開発用ログインが使えない環境では、確認用のセッションを E2E_TOKEN_A で渡す
let cookie = process.env.E2E_TOKEN_A ? `flick_sid=${process.env.E2E_TOKEN_A}` : ''
const call = async (path, method = 'GET', body) => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(base + path, { method, redirect: 'manual', headers: { cookie, 'content-type': 'application/json', origin: base }, body: body && JSON.stringify(body) })
    const set = r.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    if (r.status >= 500 && i < 3) {
      await new Promise((ok) => setTimeout(ok, 500))
      continue
    }
    return r.json().catch(() => ({}))
  }
}
if (!cookie) await call('/auth/dev?as=4')
const created = (await call('/api/tasks', 'POST', { tasks: CASES.map(([title]) => ({ title: `WPROBE ${title}` })) })).tasks
let list = []
for (let i = 0; i < 20; i++) {
  await new Promise((ok) => setTimeout(ok, 1500))
  list = (await call('/api/tasks')).tasks.filter((t) => t.title.startsWith('WPROBE'))
  if (list.length === CASES.length && list.every((t) => t.weightAi)) break
}
let exact = 0
let off2 = 0
for (const [title, want] of CASES) {
  const got = list.find((t) => t.title === `WPROBE ${title}`)?.weightAi ?? '-'
  const d = Math.abs(ORDER.indexOf(got) - ORDER.indexOf(want))
  if (d === 0) exact++
  if (d >= 2 || got === '-') off2++
  console.log(`${d === 0 ? '✓' : d === 1 ? '△' : '✗'} ${want.padEnd(2)} → ${got.padEnd(2)}  ${title}`)
}
const xlWant = CASES.filter(([, w]) => w === 'XL').map(([t]) => t)
const xlGot = list.filter((t) => t.weightAi === 'XL').map((t) => t.title.slice(7))
console.log(`\n一致 ${exact}/${CASES.length}、2段階以上ずれ ${off2}件、特大 ${xlGot.length}件 (期待 ${xlWant.length}件)、特大の誤判定 ${xlGot.filter((t) => !xlWant.includes(t)).join('・') || 'なし'}`)
for (const t of created) await call(`/api/tasks/${t.id}`, 'DELETE')
