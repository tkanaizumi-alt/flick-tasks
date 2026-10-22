# Flick

開いた瞬間にメモでき、カードのフリックでステータスを切り替えるタスク管理 Web アプリ。

https://flick-tasks.tkanaizumi.workers.dev

## 機能

- **即メモ**: 入力欄は素の HTML に置いてあり、JS 読込前から入力・送信できる (localStorage にキューし、起動後に同期)
- **フリック**: 右 = 次のステータス / 左 = 前のステータス (端では削除)。取り消し可
  - 未着手 → 進行中 → 完了
- **AI (Workers AI)**
  - メモ欄の ✦ : 音声入力のような長文メモを複数タスクに分割
  - タスク詳細の「AIで分解」: サブタスクに分解
- **Google ログインのみ** (OAuth 2.0 + PKCE、セッションは HttpOnly Cookie)
- 全画面スケルトンローディング、Liquid Glass UI、モバイルファースト
- **みんな**: 全員のレベル・完了数・到達ステージ・最近の動き。タップでその人のタスクとキャラクターを閲覧
- **冒険** (ミニゲーム)
  - タスク完了で XP。AI がタスクの重さを 小/中/大 で判定し 10/20/40 XP (作成直後の完了は減点、完了を戻すと XP も戻る)
  - レベルごとに 3 SP。ステータス (攻撃・体力・会心・回復) に振るか、スキル (戦士・守護・賢者) を取るか選ぶ
  - ステージ制のボスに自動バトルで挑戦。勝つとリセットの書 (SP 振り直し) を獲得
  - ルールは `shared/game.ts`。判定はすべてサーバー側

## 構成

| 層 | 技術 |
| --- | --- |
| フロント | React 19 + Vite + Motion |
| API | Cloudflare Workers + Hono |
| DB | Cloudflare D1 |
| AI | Workers AI (`@cf/google/gemma-4-26b-a4b-it`、フォールバック `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| 配信 | Workers Static Assets |

```
index.html        初期スケルトン + 即メモ入力欄 (React 非依存)
src/              React アプリ
worker/           API (index.ts), 認証 (auth.ts), AI (ai.ts)
shared/           フロント・API 共通の型
migrations/       D1 スキーマ
```

## セットアップ

```bash
npm install
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply flick-db --local
npm run dev
```

ローカルでは `.dev.vars` の `DEV_LOGIN=1` により、ログイン画面に localhost 専用の `dev login` が出ます (本番では無効)。

### Google OAuth

Google Cloud Console で「ウェブ アプリケーション」の OAuth クライアントを作成し、リダイレクト URI に以下を登録:

- `https://<your-worker>.workers.dev/auth/callback`
- `http://localhost:5173/auth/callback`

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# 任意: 使える人を限定 (カンマ区切り)。未設定なら制限なし
npx wrangler secret put ALLOWED_EMAILS
```

### デプロイ

```bash
npx wrangler d1 create flick-db   # 出力された database_id を wrangler.jsonc に設定
npm run db:migrate:remote
npm run deploy
```
