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
  page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/auth/dev?as=3`)
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
    await page.press('#memo', 'Enter')
    await page.getByTestId('task').filter({ hasText: title }).first().waitFor({ timeout: 10000 })
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
    await openMenu('menu-templates')
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

  await step('冒険のショップ', async () => {
    await dismiss()
    await page.getByTestId('nav-game').click()
    await page.getByTestId('adv-loot').click()
    await page.getByTestId('buy-bag').waitFor()
    return (await page.getByTestId('shop').innerText()).includes('みんなに差し入れ')
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
