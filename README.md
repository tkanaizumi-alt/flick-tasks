# Flick

開いた瞬間にメモでき、カードのフリックでステータスを切り替えるタスク管理 Web アプリ。

https://flick-tasks.kagamoku.workers.dev

## 機能

- **即メモ**: 入力欄は素の HTML に置いてあり、JS 読込前から入力・送信できる (localStorage にキューし、起動後に同期)
- **フリック**: 右 = 次のステータス / 左 = 前のステータス (端では削除)。取り消し可
  - 未着手 → 進行中 → 完了
- **AI (Workers AI)**
  - メモ欄の ✦ : 音声入力のような長文メモを複数タスクに分割
  - タスク詳細の「AIで分解」: 分解案を確認画面で編集してから追加。子タスクは元タスクにつながり (↳ 元タスク名・色・3/5 の進み具合)、XP は元タスクの分を分け合う (分解は 1 段・7 件まで)
  - 履歴の「AIで日報・月報の下書き」: 期間内の完了タスクから報告文を作成
- **複数選択**: 長押しで選択 → まとめて 次へ / 完了 / 削除
- **状況フラグ**: 確認待ち (相手を指定) / 困っている / 遅れそう。みんなの「要対応」に期限切れと一緒に並ぶ
- **依頼**: 他の人のリストにタスクを依頼し、自分側の後続タスクとつなげる。完了するとアプリ内通知 (みんなタブのバッジ)
- **履歴**: 完了タスクはボードから 7 日で消え、履歴に約 1 年残る。期間・#タグを選んで CSV (Excel 対応) 保存・テキストコピー
- **並び替え**: 手動 (≡ をドラッグ) / 重要度順 / 期日順。依頼されたタスクは常に上に固定
- **#タグ**: タイトルや詳細に `#A社` と書くとタグになり、一覧・履歴で絞り込める
- **繰り返し**: 毎日 / 平日 / 毎週◯曜 / 毎月◯日。その日に開くと未着手に追加される
- **コメント**: 自分・他の人のタスクに書ける。持ち主・依頼した人・これまでコメントした人に通知
- **お知らせ (定期実行)**: 毎朝 8 時に今日・明日が期限のタスク、金曜 17 時に AI の「週のふりかえり」(履歴から見られる)
- **PC**: 幅 1000px 以上では左にサイドバー、未着手・進行中・完了の 3 列ボード
- **Google ログインのみ** (OAuth 2.0 + PKCE、セッションは HttpOnly Cookie)
- 全画面スケルトンローディング、Liquid Glass UI、モバイルファースト
- **みんな**: お知らせ・要対応・依頼・最近の動き (すべて/未着手/進行中/完了、人で絞り込み、さかのぼり)・全員のレベルと到達ステージ。タップでその人のタスクとキャラクターを閲覧
- **冒険** (ミニゲーム)
  - タスク完了で XP。AI がタスクの重さを 小/中/大 で判定し 10/20/40 XP (作成直後の完了は減点、完了を戻すと XP も戻る)
  - レベルごとに 3 SP。ステータス (攻撃・体力・会心・回復) に振るか、スキル (戦士・守護・賢者) を取るか選ぶ
  - ステージ制のボスに自動バトルで挑戦。宝箱の SR/SSR は専用の演出
  - スキン: レベル・ステージで解放され、アイコンとして全画面に表示
  - 実績と称号 (名前の横に表示)、連続日数 🔥
  - 週のレイドボス: 全員のその週の XP がダメージ。倒すとダメージを与えた人に報酬
  - 先週の MVP (いちばん完了・成長・手伝った人) をみんなの画面に表示
  - 装備の強化 (同じ部位・レア度の装備を使って +1〜+5)、ショップ (XP2倍チケット・SR 以上確定の宝箱)
  - ペット (実績の数で仲間になり、XP・ゴールドに少しボーナス)、季節イベント (期間中 XP+10%、10 件完了で限定スキン)
  - 負けたときに、何が足りなかったかのアドバイス
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

### テスト

```bash
npm test            # 共通ロジック (XP・ミッション・繰り返し・連続日数・タグ など) の単体テスト
npm run test:e2e    # npm run dev を起動した状態で、API の通しテスト (開発用ログインの 2 人で操作)
```

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
