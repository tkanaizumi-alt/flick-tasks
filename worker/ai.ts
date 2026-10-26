import type { Env } from './env'

const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const FALLBACK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const schema = {
  type: 'object',
  properties: {
    tasks: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  },
  required: ['tasks'],
}

const PROMPTS = {
  split: `あなたはタスク整理アシスタントです。ユーザーのメモ(音声入力で句読点が無いことがある)を読み、実行可能なタスクに分割してください。
- 各タスクは日本語で簡潔に(40文字以内)、動詞で終える
- 元の意図や固有名詞・日時は残す
- 重複や雑談は除く
- タスクが1つならそれ1つだけ返す
JSON {"tasks": string[]} のみを返してください。`,
  breakdown: `あなたはタスク分解アシスタントです。与えられたタスク(1行目が件名、2行目以降が詳細)を、すぐ着手できる具体的なサブタスク3〜7個に分解してください。
- 1件は「15分〜半日で終わり、終わったと報告できる単位」にする。細かくしすぎない
- 各サブタスクは日本語で簡潔に(40文字以内)、動詞で終える
- 何の作業か単体で分かるよう、元タスクの対象(案件名・相手・資料名など)を入れる
- 実行する順番に並べる
JSON {"tasks": string[]} のみを返してください。`,
} as const

function extractText(res: any): string {
  if (typeof res === 'string') return res
  if (res?.response !== undefined) return typeof res.response === 'string' ? res.response : JSON.stringify(res.response)
  const content = res?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  return JSON.stringify(res ?? {})
}

function parseTasks(text: string): string[] {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return []
    try {
      data = JSON.parse(m[0])
    } catch {
      return []
    }
  }
  const list = Array.isArray(data) ? data : data?.tasks
  if (!Array.isArray(list)) return []
  return list
    .map((t) => String(typeof t === 'object' && t ? (t.title ?? t.task ?? '') : t).trim())
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, 200))
    .slice(0, 12)
}

async function run(env: Env, model: string, kind: keyof typeof PROMPTS, input: string, extra: object = {}) {
  const res = await env.AI.run(model as any, {
    messages: [
      { role: 'system', content: PROMPTS[kind] },
      { role: 'user', content: input },
    ],
    response_format: { type: 'json_schema', json_schema: schema },
    max_tokens: 800,
    temperature: 0.2,
    ...extra,
  } as any)
  return parseTasks(extractText(res))
}

export async function aiTasks(env: Env, kind: keyof typeof PROMPTS, input: string): Promise<string[]> {
  try {
    // 推論 (thinking) を切ると応答が 3〜7 秒 → 2 秒弱になる
    const tasks = await run(env, MODEL, kind, input, { chat_template_kwargs: { enable_thinking: false } })
    if (tasks.length) return tasks
  } catch (e) {
    console.error('primary model failed', e)
  }
  return run(env, FALLBACK_MODEL, kind, input)
}

const REPORT_PROMPT = `あなたは日報・月次報告の作成アシスタントです。ユーザーが期間内に完了したタスクの一覧(日付つき)から、上司に提出できる報告文を日本語で作ってください。
- 1行目に「【期間】」を書く
- 「主な成果」を3〜6個の箇条書き(「・」始まり)で、関連するタスクはまとめる
- 「件数」として完了件数を書く
- 最後に「所感」を1〜2文(事実から言える範囲で。誇張しない)
- 見出しは【】で囲む。Markdown 記号(#, *)は使わない`

/** 完了タスクの一覧から日報・月次報告の下書きを作る */
export async function aiReport(env: Env, period: string, lines: string[]): Promise<string> {
  const input = `期間: ${period}\n完了タスク(${lines.length}件):\n${lines.join('\n')}`.slice(0, 6000)
  const call = async (model: string, extra: object = {}) => {
    const res = await env.AI.run(model as any, {
      messages: [
        { role: 'system', content: REPORT_PROMPT },
        { role: 'user', content: input },
      ],
      max_tokens: 900,
      temperature: 0.3,
      ...extra,
    } as any)
    return extractText(res).trim()
  }
  try {
    const text = await call(MODEL, { chat_template_kwargs: { enable_thinking: false } })
    if (text) return text
  } catch (e) {
    console.error('report primary failed', e)
  }
  return call(FALLBACK_MODEL)
}
