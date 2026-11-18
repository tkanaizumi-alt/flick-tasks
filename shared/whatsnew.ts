/**
 * 「新しくなったこと」のお知らせ。VERSION を上げると、まだ見ていない人に一度だけ出る。
 * action があれば「試す」ボタンでその画面を開く
 */
export const WHATS_NEW_VERSION = '2026-11-18c'

export type WhatsNewAction = 'history' | 'templates' | 'people' | 'calendar' | 'game'

export const WHATS_NEW: { icon: string; title: string; desc: string; action?: WhatsNewAction; button?: string; game?: boolean }[] = [
  { icon: '🌌', title: 'ステージ100まで（シークレット）', desc: 'ステージ30の先に、100まで隠しステージが続きます。ボスは倒すまで「？？？」。倒すと地図と図鑑に載ります。100の先は無限の塔', action: 'game', button: '冒険を開く', game: true },
  { icon: '💎', title: '装備はレア度が大事に', desc: '同じステージの装備なら、1つ上のレア度の+0は下のレア度の+10に負けません（UR > SR+10）。今の装備も新しい強さに計算し直しました。バトルのキャラは丸い枠のない姿に', action: 'game', button: '冒険を開く', game: true },
  { icon: '🎬', title: 'バトルが動画のように', desc: '画面が大きくなり、駆け寄って斬る・火球が飛ぶ・必殺技のカットイン・倒すと敵が砕ける、などの演出が付きました。オートは ⏩ で早送り', action: 'game', button: '冒険を開く', game: true },
  { icon: '⚔️', title: '職業のわざ', desc: 'ターン制バトルで、職業ごとの「わざ」と必殺技が使えます（戦士は二段斬り、魔法使いは火球など）。上位職でわざが2つに', action: 'game', button: '冒険を開く', game: true },
  { icon: '🔨', title: '装備の打ち直し・✦効果の強さ', desc: '昔の装備を💰で今のステージの強さに上げ直せます。✦効果はレア度が高いほど強く（UR の鉄壁は-30%など）', action: 'game', button: '冒険を開く', game: true },
  { icon: '🎮', title: 'ターン制バトル', desc: 'バトルの画面で「ターン制」を選ぶと、毎ターン行動を自分で選んで戦えます。敵の強攻撃はまもってしのごう', action: 'game', button: '冒険を開く', game: true },
  { icon: '⏰', title: '仕事ぶりのボーナス', desc: '期限内の完了・依頼されたタスクの完了でXP+10%。「困っている」タスクにコメントすると助け合いボーナス', game: true },
  { icon: '🤝', title: '協力クエスト', desc: '週替わりのみんなの目標。達成すると全員が💰とSR以上の装備を受け取れます', action: 'game', button: '冒険を開く', game: true },
  { icon: '📖', title: '図鑑・セット効果・ペットの進化', desc: '図鑑をうめてご褒美、同じシリーズの装備3部位でセット効果、ペットは★3まで進化、✦効果は💰で付け直し', action: 'game', button: '冒険を開く', game: true },
  { icon: '🔍', title: '終わったタスクを探せる', desc: 'メニューの「履歴」の上の検索欄から、前に完了したタスクを件名・詳細で探せます。CSV保存やコピーも', action: 'history', button: '履歴を開く' },
  { icon: '📋', title: 'テンプレート', desc: '「タスクを記入」の横の 📋 から、よく使うタスクのセットを保存して1回で追加できます', action: 'templates', button: '開く' },
  { icon: '🎉', title: 'リアクション', desc: '「みんな」で人を選んでタスクを押すと、👍🎉💪🙏👀 を送れます。相手に通知が届きます', action: 'people', button: 'みんなを開く' },
  { icon: '📅', title: 'カレンダー表示', desc: '自分の画面の右上の 📅 で、期限のあるタスクを月のカレンダーで見られます', action: 'calendar', button: 'カレンダーにする' },
  { icon: '🔤', title: '見やすさの設定', desc: '右下のアイコンのメニューから、文字の大きさ（4段階）・ダークモード・シンプル表示（ゲームを隠す）を選べます' },
  { icon: '🎰', title: '宝箱の10連ガチャ', desc: '冒険の「宝箱」で10回まとめて開けられます。SR以上が1個確定', action: 'game', button: '冒険を開く', game: true },
  { icon: '🎁', title: 'ミッションをまとめて受け取る', desc: '冒険の「ミッション」で、達成したものを1回で受け取れます', action: 'game', button: '冒険を開く', game: true },
  { icon: '❔', title: '隠し要素が増えました', desc: '上位職のさらに先の職業、隠しスキル・隠し実績・隠しスキン。見つかるまで「？？？」です', action: 'game', button: '冒険を開く', game: true },
]
