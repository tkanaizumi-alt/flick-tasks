/**
 * 「新しくなったこと」のお知らせ。VERSION を上げると、まだ見ていない人に一度だけ出る。
 * action があれば「試す」ボタンでその画面を開く
 */
export const WHATS_NEW_VERSION = '2026-11-13b'

export type WhatsNewAction = 'history' | 'templates' | 'people' | 'calendar' | 'game'

export const WHATS_NEW: { icon: string; title: string; desc: string; action?: WhatsNewAction; button?: string; game?: boolean }[] = [
  { icon: '🔍', title: '終わったタスクを探せる', desc: 'メニューの「履歴」の上の検索欄から、前に完了したタスクを件名・詳細で探せます。CSV保存やコピーも', action: 'history', button: '履歴を開く' },
  { icon: '📋', title: 'テンプレート', desc: '「タスクを記入」の横の 📋 から、よく使うタスクのセットを保存して1回で追加できます', action: 'templates', button: '開く' },
  { icon: '🎉', title: 'リアクション', desc: '「みんな」で人を選んでタスクを押すと、👍🎉💪🙏👀 を送れます。相手に通知が届きます', action: 'people', button: 'みんなを開く' },
  { icon: '📅', title: 'カレンダー表示', desc: '自分の画面の右上の 📅 で、期限のあるタスクを月のカレンダーで見られます', action: 'calendar', button: 'カレンダーにする' },
  { icon: '🔤', title: '見やすさの設定', desc: '右下のアイコンのメニューから、文字の大きさ（4段階）・ダークモード・シンプル表示（ゲームを隠す）を選べます' },
  { icon: '🎰', title: '宝箱の10連ガチャ', desc: '冒険の「宝箱」で10回まとめて開けられます。SR以上が1個確定', action: 'game', button: '冒険を開く', game: true },
  { icon: '🎁', title: 'ミッションをまとめて受け取る', desc: '冒険の「ミッション」で、達成したものを1回で受け取れます', action: 'game', button: '冒険を開く', game: true },
  { icon: '❔', title: '隠し要素が増えました', desc: '上位職のさらに先の職業、隠しスキル・隠し実績・隠しスキン。見つかるまで「？？？」です', action: 'game', button: '冒険を開く', game: true },
]
