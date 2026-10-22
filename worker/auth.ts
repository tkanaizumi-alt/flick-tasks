import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { displayName, isAdmin, isAllowed, type Env, type Vars } from './env'

const SESSION_COOKIE = 'flick_sid'
const OAUTH_COOKIE = 'flick_oauth'
const SESSION_TTL = 60 * 60 * 24 * 30 // 30日

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

const sha256 = async (s: string) =>
  b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

const isLocal = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)

const cookieOpts = (url: URL, maxAge: number) => ({
  httpOnly: true,
  secure: !isLocal(url),
  sameSite: 'Lax' as const,
  path: '/',
  maxAge,
})

export async function createSession(c: any, userId: string) {
  const token = randomToken()
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL
  await c.env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, expires)
    .run()
  setCookie(c, SESSION_COOKIE, token, cookieOpts(new URL(c.req.url), SESSION_TTL))
}

/** Cookie からユーザーを解決。期限の半分を過ぎていたら延長する */
export async function resolveUser(c: any) {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const sid = await sha256(token)
  const row = await c.env.DB.prepare(
    `SELECT s.expires_at, u.id, u.email, u.name, u.display_name, u.picture
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  )
    .bind(sid)
    .first()
  const now = Math.floor(Date.now() / 1000)
  if (!row || (row.expires_at as number) < now) return null
  if (!isAllowed(c.env, row.email as string)) return null
  if ((row.expires_at as number) - now < SESSION_TTL / 2) {
    await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(now + SESSION_TTL, sid)
      .run()
    setCookie(c, SESSION_COOKIE, token, cookieOpts(new URL(c.req.url), SESSION_TTL))
  }
  return {
    id: row.id,
    email: row.email,
    name: displayName(row as any),
    picture: row.picture,
    isAdmin: isAdmin(c.env, row.email as string),
  } as Vars['user']
}

async function upsertUser(
  db: D1Database,
  p: { sub: string; email: string; name: string; picture: string },
) {
  const existing = await db.prepare('SELECT id FROM users WHERE google_sub = ?').bind(p.sub).first<{ id: string }>()
  if (existing) {
    await db
      .prepare('UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?')
      .bind(p.email, p.name, p.picture, existing.id)
      .run()
    return existing.id
  }
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, p.sub, p.email, p.name, p.picture, Date.now())
    .run()
  return id
}

export const auth = new Hono<{ Bindings: Env; Variables: Vars }>()

auth.get('/google', async (c) => {
  const url = new URL(c.req.url)
  if (!c.env.GOOGLE_CLIENT_ID) return c.text('GOOGLE_CLIENT_ID is not configured', 500)
  const state = randomToken(16)
  const verifier = randomToken(48)
  const challenge = await sha256(verifier)
  setCookie(c, OAUTH_COOKIE, `${state}.${verifier}`, cookieOpts(url, 600))
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

auth.get('/callback', async (c) => {
  const url = new URL(c.req.url)
  const saved = getCookie(c, OAUTH_COOKIE)
  deleteCookie(c, OAUTH_COOKIE, { path: '/' })
  const [state, verifier] = (saved ?? '').split('.')
  const code = url.searchParams.get('code')
  if (!code || !state || state !== url.searchParams.get('state')) return c.redirect('/?login=failed')

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/auth/callback`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!tokenRes.ok) return c.redirect('/?login=failed')
  const { id_token } = (await tokenRes.json()) as { id_token?: string }
  if (!id_token) return c.redirect('/?login=failed')

  // Google のトークンエンドポイントから TLS で直接受け取った ID トークンなので署名検証は省略し、クレームのみ確認
  const claims = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)),
    ),
  )
  const validIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!validIss || claims.aud !== c.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || !claims.email_verified) {
    return c.redirect('/?login=failed')
  }
  if (!isAllowed(c.env, claims.email)) return c.redirect('/?login=denied')

  const userId = await upsertUser(c.env.DB, {
    sub: claims.sub,
    email: claims.email,
    name: claims.name ?? '',
    picture: claims.picture ?? '',
  })
  await createSession(c, userId)
  return c.redirect('/')
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// ローカル開発専用のテストログイン。DEV_LOGIN=1 かつ localhost のときのみ有効
auth.get('/dev', async (c) => {
  const url = new URL(c.req.url)
  if (c.env.DEV_LOGIN !== '1' || !isLocal(url)) return c.notFound()
  // ?as=2 などで別ユーザーとしてログイン (みんなの画面の確認用)
  const n = /^\d{1,2}$/.test(url.searchParams.get('as') ?? '') ? url.searchParams.get('as')! : ''
  const userId = await upsertUser(c.env.DB, {
    sub: `dev-user${n}`,
    email: `dev${n}@localhost`,
    name: n ? `Dev User ${n}` : 'Dev User',
    picture: '',
  })
  await createSession(c, userId)
  return c.redirect('/')
})
