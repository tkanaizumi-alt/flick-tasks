// 画面の通しテスト。ローカルの開発サーバー (npm run dev、.dev.vars に DEV_LOGIN=1) を、パソコンの Edge で実際に操作する
//   npm run test:ui            → http://localhost:5173
//   npm run test:ui -- <URL>   → 別のローカル URL
// 開発用ログインの 3 人目で操作し、作ったタスク・テンプレートは最後に消す。EDGE_PATH で Edge の場所を変えられる
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:5173'
const PREFIX = 'UI-AUTO'
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${JSON.stringify(detail)?.slice(0, 200)}`}`)
}
let page = null
const step = async (name, fn) => {
  try {
    const r = await fn()
    check(name, r !== false, r)
  } catch (e) {
    check(name, false, String(e?.message ?? e).split('\n')[0])
    // 開いたままのシートを閉じて、次の確認に影響させない
    await page?.keyboard.press('Escape').catch(() => {})
    await page?.waitForTimeout(400)
  }
}

const browser = await chromium.launch({
  headless: process.env.HEADED !== '1',
  ...(process.env.EDGE_PATH ? { executablePath: process.env.EDGE_PATH } : { channel: 'msedge' }),
})

/** 1 つの画面の大きさで一通り操作する */
async function run(label, viewport) {
  console.log(`\n--- ${label} (${viewport.width}×${viewport.height}) ---`)
  const ctx = await browser.newContext({ viewport, locale: 'ja-JP', permissions: ['clipboard-read', 'clipboard-write'] })
  // 本番など開発用ログインが使えない環境では、確認用のセッションを E2E_TOKEN_A で渡す
  if (process.env.E2E_TOKEN_A) await ctx.addCookies([{ name: 'flick_sid', value: process.env.E2E_TOKEN_A, url: base }])
  page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(process.env.E2E_TOKEN_A ? base : `${base}/auth/dev?as=3`)
  await page.waitForSelector('[data-testid="nav-me"]', { timeout: 20000 })
  // 初めての案内やお祝いが出ていたら閉じる
  const dismiss = async () => {
    for (const id of ['layout-guide-ok', 'levelup-go', 'xp-guide-close']) {
      const b = page.getByTestId(id)
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {})
    }
  }
  await page.waitForTimeout(1800)
  await dismiss()
  const title = `${PREFIX} ${label} ${Date.now().toString(36)}`

  await step('タスクを追加', async () => {
    await page.fill('#memo', title)
    // 保存が終わるまで待つ (保存中のカードは開けない)
    const saved = page.waitForResponse((r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST', { timeout: 15000 })
    await page.press('#memo', 'Enter')
    await saved
    await page.getByTestId('task').filter({ hasText: title }).first().waitFor({ timeout: 10000 })
    await page.waitForTimeout(300)
  })

  await step('タスクを開いて完了にする', async () => {
    await page.getByTestId('task').filter({ hasText: title }).first().click()
    await page.getByTestId('sheet').waitFor()
    await page.getByTestId('sheet-status-done').click()
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await dismiss()
    await page.getByTestId('sheet').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
    const r = await page.request.get(`${base}/api/tasks`)
    return (await r.json()).tasks.some((t) => t.title === title && t.status === 'done')
  })

  const openMenu = async (item) => {
    await dismiss()
    await page.getByTestId('avatar').click()
    await page.getByTestId(item).click()
  }

  await step('テンプレートを作って追加する', async () => {
    // メモ欄の横のボタンから開く
    // 完了のお祝い (実績など) が重なっていたら閉じてから押し直す
    for (let i = 0; i < 3; i++) {
      await dismiss()
      if (await page.click('#tpl-btn', { timeout: 5000 }).then(() => true, () => false)) break
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
    }
    await page.getByTestId('templates').waitFor()
    await page.fill('[data-testid="template-name"]', `${PREFIX} 月末`)
    await page.fill('[data-testid="template-items"]', `${PREFIX} 請求書\n${PREFIX} 経費精算`)
    await page.getByTestId('template-save').click()
    const card = page.getByTestId('template').filter({ hasText: `${PREFIX} 月末` })
    await card.waitFor()
    await card.getByTestId('template-apply').click()
    await page.getByTestId('task').filter({ hasText: `${PREFIX} 経費精算` }).first().waitFor({ timeout: 10000 })
    return (await page.getByTestId('task').filter({ hasText: `${PREFIX} 請求書` }).count()) >= 1
  })

  await step('履歴で完了タスクを探す', async () => {
    await openMenu('menu-history')
    await page.getByTestId('history').waitFor()
    await page.fill('[data-testid="history-search"]', title.split(' ').at(-1))
    await page.getByTestId('history-item').filter({ hasText: title }).waitFor({ timeout: 8000 })
    await page.keyboard.press('Escape')
    await page.getByTestId('history').waitFor({ state: 'detached' })
  })

  await step('カレンダーの URL を作って止める', async () => {
    await openMenu('menu-calendar')
    await page.getByTestId('calendar').waitFor()
    // 読み込みが終わってから (URL がまだ無ければ作る)
    await page.locator('[data-testid="calendar-make"], [data-testid="calendar-url"]').first().waitFor()
    if (await page.getByTestId('calendar-make').isVisible()) await page.getByTestId('calendar-make').click()
    const url = await page.getByTestId('calendar-url').inputValue({ timeout: 8000 })
    await page.getByTestId('calendar-stop').click()
    await page.getByTestId('calendar-make').waitFor()
    await page.keyboard.press('Escape')
    return url.includes('/cal/') && url.endsWith('.ics')
  })

  await step('ダークモードに切り替える', async () => {
    for (let i = 0; i < 3; i++) {
      if ((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark') break
      await dismiss()
      await page.getByTestId('avatar').click()
      await page.getByTestId('menu-theme').click()
      await page.keyboard.press('Escape')
      await page.mouse.click(5, 5)
    }
    const dark = (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark'
    // 元に戻す (自動)
    await page.evaluate(() => localStorage.setItem('flick.theme', JSON.stringify('auto')))
    return dark
  })

  await step('メンバーと腕試し', async () => {
    await dismiss()
    await page.getByTestId('nav-game').click()
    await page.getByTestId('adv-battle').click()
    await page.getByTestId('spar').waitFor()
    await page.getByTestId('spar-fight').first().click()
    await page.getByTestId('battle').waitFor()
    // 短いバトルはスキップのボタンが出る前に終わる
    await page.getByTestId('battle-skip').click({ timeout: 2000 }).catch(() => {})
    await page.getByTestId('spar-note').waitFor()
    const note = await page.getByTestId('spar-note').innerText()
    await page.getByTestId('battle-close').click()
    await page.getByTestId('battle').waitFor({ state: 'detached' })
    return note.includes('練習試合')
  })

  await step('季節イベントの限定ボス (開催中だけ)', async () => {
    const ev = await (await page.request.get(`${base}/api/event/boss`)).json()
    const shown = await page.getByTestId('event-boss').isVisible().catch(() => false)
    return ev.event ? shown && (await page.getByTestId('event-gear').innerText()).includes(ev.gear[0].name) : !shown
  })

  await step('冒険のショップ', async () => {
    await dismiss()
    await page.getByTestId('nav-game').click()
    await page.getByTestId('adv-loot').click()
    await page.getByTestId('buy-bag').waitFor()
    return (await page.getByTestId('shop').innerText()).includes('みんなに差し入れ')
  })

  await step('文字の大きさを変える', async () => {
    const before = await page.locator('#memo').boundingBox()
    await page.getByTestId('avatar').click()
    await page.getByTestId('menu-font').click() // 標準 → 大
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    const zoom = await page.evaluate(() => getComputedStyle(document.documentElement).zoom)
    const after = await page.locator('#memo').boundingBox()
    // 横にはみ出さない
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    await page.evaluate(() => localStorage.setItem('flick.font', JSON.stringify('m')))
    return zoom === '1.12' && after.height > before.height && fits ? true : { zoom, before, after, fits }
  })

  await step('シンプル表示で冒険・XP を隠す', async () => {
    await dismiss()
    await page.getByTestId('nav-me').click()
    await page.getByTestId('avatar').click()
    await page.getByTestId('menu-simple').click()
    await page.mouse.click(5, 5)
    await page.waitForTimeout(400)
    const hidden = (await page.getByTestId('nav-game').count()) === 0 && (await page.locator('.xp-chip:visible').count()) === 0
    await page.getByTestId('avatar').click()
    await page.getByTestId('menu-simple').click() // 戻す
    await page.mouse.click(5, 5)
    await page.getByTestId('nav-game').waitFor()
    return hidden
  })

  await step('みんなの画面', async () => {
    await page.getByTestId('nav-people').click()
    await page.waitForTimeout(1200)
    return (await page.locator('main').innerText()).length > 0
  })

  if (viewport.width >= 1000) {
    await step('PC では PC 用の見え方', async () => (await page.evaluate(() => document.body.dataset.layout)) === 'pc')
  } else {
    await step('スマホではスマホ用の見え方', async () => (await page.evaluate(() => document.body.dataset.layout)) === 'mobile')
  }

  check('画面のエラーなし', errors.length === 0, errors)

  // 後片付け
  const { tasks } = await (await page.request.get(`${base}/api/tasks`)).json()
  for (const t of tasks.filter((t) => t.title.startsWith(PREFIX))) await page.request.delete(`${base}/api/tasks/${t.id}`, { headers: { origin: base } })
  const { templates } = await (await page.request.get(`${base}/api/templates`)).json()
  for (const t of templates.filter((t) => t.name.startsWith(PREFIX))) await page.request.delete(`${base}/api/templates/${t.id}`, { headers: { origin: base } })
  await ctx.close()
}

try {
  await run('スマホ', { width: 390, height: 844 })
  await run('PC', { width: 1280, height: 860 })
} finally {
  await browser.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 件 合格`)
process.exit(failed.length ? 1 : 0)
