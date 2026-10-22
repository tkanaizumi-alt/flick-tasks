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
  breakdown: `あなたはタスク分解アシスタントです。与えられたタスクを、すぐ着手できる具体的なサブタスク3〜6個に分解してください。
- 各サブタスクは日本語で簡潔に(40文字以内)、動詞で終える
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
