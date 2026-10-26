import { motion } from 'motion/react'
import { BREAKDOWN_MAX, WEIGHT_GUIDE, WEIGHT_LABEL, WEIGHT_XP, type Weight } from '../../shared/game'

const WEIGHTS: Weight[] = ['S', 'M', 'L']

/** 獲得 XP の決まり方と、タスクを登録する単位の目安 */
export function XpGuide({ onClose }: { onClose: () => void }) {
  return (
    <>
      <motion.div className="scrim top" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="guide glass"
        role="dialog"
        aria-label="XPの決まり方"
        data-testid="xp-guide"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.16 }}
      >
        <h2>XPの決まり方</h2>
        <p className="muted">タスクを追加すると、AIが作業量を「小・中・大」に判定します。判定前は「中」として計算します。</p>
        <table className="guide-table">
          <tbody>
            {WEIGHTS.map((w) => (
              <tr key={w}>
                <th className={`w-${w}`}>{WEIGHT_LABEL[w]}</th>
                <td>{WEIGHT_GUIDE[w]}</td>
                <td className="guide-xp">+{WEIGHT_XP[w]}XP</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>AIで分解したとき</h3>
        <p>元タスクのXPを子タスクで分け合います（例: 「大」40XP を4件に分解 → 1件10XP）。細かく分けても合計は増えません。分解は1回・{BREAKDOWN_MAX}件までです。</p>
        <h3>登録する単位の目安</h3>
        <p>1件 = <b>15分〜半日で終わり、「終わりました」と報告できる単位</b>。それより大きい仕事はAIで分解、小さすぎる作業はまとめて1件にしましょう。</p>
        <h3>ボーナス</h3>
        <ul>
          <li>その日の最初の完了 +5</li>
          <li>スキル・装備・隠しスキルで +10〜30%</li>
          <li>追加して2分以内の完了は ×0.25（稼ぎ防止）</li>
        </ul>
        <button className="pill-btn primary" onClick={onClose} data-testid="xp-guide-close">
          OK
        </button>
      </motion.div>
    </>
  )
}
