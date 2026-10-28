import { useEffect } from 'react'
import { motion, useDragControls } from 'motion/react'

/** 使い方 (画面ごとにできること・PC のキーボード操作) */
const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: '✏️ 自分（タスク）',
    items: [
      '上のメモ欄に書いて送るとすぐ追加。✦ を押すと、長いメモをAIが複数のタスクに分けます',
      'カードを右にフリックで次へ（未着手 → 進行中 → 完了）、左で前へ。端では削除',
      '長押しで複数選択 → まとめて次へ・完了・削除',
      'カードをタップで詳細: 期限・重要度・大きさ・状況（確認待ち・困っている・遅れそう）・繰り返し・コメント・AIで分解',
      'タイトルに #A社 のように書くとタグになり、上のタグで絞り込めます',
      '並び順は 手動（≡ をドラッグで並べ替え）・重要度順・期日順。完了は 完了が新しい順・古い順・重要度順',
      '依頼されたタスクは一番上に固定されます',
    ],
  },
  {
    title: '👥 みんな',
    items: [
      'あなたへのお知らせ（依頼・完了・コメント・期限など）。「すべて既読」やタップでそのタスクを開けます',
      '要対応: 全員の 確認待ち・困っている・遅れそう・期限切れ',
      '依頼: 受けた依頼・出した依頼。「＋ 依頼する」から他の人にタスクを頼めます',
      '最近の動き・先週のMVP・冒険の進み具合・メンバー一覧。メンバーをタップするとその人のタスクを見て、期限の設定・進行中/完了にする・コメントができます',
    ],
  },
  {
    title: '⚔️ 冒険',
    items: [
      'タスクを完了するとXPとゴールド。大きさ（小・中・大・特大）でXPが変わります（詳細の「XPの決まり方」）',
      'バトル: 週のレイドボス（みんなのXPがダメージ）とステージのボス',
      '宝箱・ショップ・装備の強化 / ミッション / 育成（ペット・スキン・冒険職・ステータス・スキル） / 実績（称号）',
    ],
  },
  {
    title: '📒 履歴・その他',
    items: [
      '右下のアイコンのメニューから 履歴（完了タスクの検索・CSV保存・AI日報・週のふりかえり）、見た目（ライト/ダーク）',
      '📋 テンプレート: メモ欄の横のボタンから。よく使うタスクのセットを保存して、ボタン1つで追加。長押しで選んだタスクから 📋 で作ることもできます',
      '🔤 文字の大きさ（小・標準・大・特大）と 📄 シンプル表示（冒険・XPの表示を隠す。XPは裏でたまり、戻すといつでも見られます）はメニューから',
      '📅 カレンダーに表示: 期限のある自分のタスクを Googleカレンダーに出せます（URLで追加）',
      '各画面の右上で 📱 スマホ / 💻 PC の見え方を画面ごとに切り替え（タブレット・PC）',
      '毎朝8時に期限のお知らせ、金曜17時にAIの週のふりかえりが届きます',
    ],
  },
]

const KEYS: [string, string][] = [
  ['N', '新しいタスク（メモ欄へ）'],
  ['/', 'タスクを検索'],
  ['1 / 2 / 3', '自分 / みんな / 冒険'],
  ['?', 'この使い方'],
  ['Esc', '閉じる'],
]

export function Help({ onClose }: { onClose: () => void }) {
  const controls = useDragControls()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="sheet glass help"
        role="dialog"
        aria-label="使い方"
        data-testid="help"
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        exit={{ y: '105%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        drag="y"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.9 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose()
        }}
      >
        <div className="grab-zone" onPointerDown={(e) => controls.start(e)}>
          <div className="grabber" />
        </div>
        <h2 className="sheet-h">❓ 使い方</h2>
        {SECTIONS.map((s) => (
          <section key={s.title} className="help-sec">
            <h3>{s.title}</h3>
            <ul>
              {s.items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="help-sec">
          <h3>⌨️ PCのキーボード操作</h3>
          <table className="help-keys">
            <tbody>
              {KEYS.map(([k, v]) => (
                <tr key={k}>
                  <th>
                    <kbd>{k}</kbd>
                  </th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </motion.div>
    </>
  )
}
