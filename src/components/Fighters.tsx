import { Avatar } from './Dock'

export interface FighterMoment {
  /** 自分が攻撃した / 敵が攻撃した (飛び出す動き) */
  meAttack: boolean
  foeAttack: boolean
  /** ダメージを受けた (ゆれる) */
  meHurt: boolean
  foeHurt: boolean
  /** 吹き出し (エモート) */
  meEmote?: string
  foeEmote?: string
}

/** バトルの両者 (左に自分、右に敵)。ターンごとに key を変えて動きをやり直す */
export function Fighters({
  me,
  foe,
  moment,
  step,
  done,
  win,
}: {
  me: { name: string; picture?: string; skin?: string | null }
  foe: { icon: string }
  moment: FighterMoment | null
  step: number
  done: boolean
  win: boolean
}) {
  const meEmote = done ? (win ? '✌️' : '😵') : moment?.meEmote
  const foeEmote = done ? (win ? '😵' : '😎') : moment?.foeEmote
  return (
    <div className="fighters" aria-hidden="true">
      <div key={`m${step}`} className={`fighter me ${moment?.meAttack ? 'lunge' : ''} ${moment?.meHurt ? 'hurt' : ''} ${done && !win ? 'down' : ''}`}>
        <Avatar name={me.name} picture={me.picture} skin={me.skin} size={56} />
        {meEmote && <span className="emote">{meEmote}</span>}
      </div>
      <div className="vs">VS</div>
      <div key={`f${step}`} className={`fighter foe ${moment?.foeAttack ? 'lunge' : ''} ${moment?.foeHurt ? 'hurt' : ''} ${done && win ? 'down' : ''}`}>
        <span className="foe-icon">{foe.icon}</span>
        {foeEmote && <span className="emote">{foeEmote}</span>}
      </div>
    </div>
  )
}
