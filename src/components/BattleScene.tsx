/**
 * バトルの舞台 (オート・ターン制の両方で使う)。1 ターンを短い「動画」のように見せる。
 * 1 ターン分の出来事 (Beat) から、いつ何が起きるかの時間割を作り、CSS アニメーションの遅れ (delay) で順番に再生する。
 * 動かすのは transform と opacity だけ (軽くするため)。ターンが変わったら key を変えて最初から再生し直す
 */
import type { CSSProperties, ReactNode } from 'react'
import type { TbFx } from '../../shared/turn'
import { Avatar } from './Dock'

export interface Beat {
  /** 自分の行動の演出 (攻撃しない行動は null) */
  fx: TbFx | null
  hits: { dmg: number; crit: boolean; smash?: boolean }[]
  /** 必殺技 (カットインを出す) */
  special?: { name: string; icon: string }
  /** わざ (名前を小さく出す) */
  tech?: { name: string; icon: string }
  guard?: boolean
  /** 回復薬・わざで回復した量 */
  potion?: number
  /** 敵の行動 */
  foe: 'attack' | 'heavy' | 'charge' | 'none'
  stunned?: boolean
  dodged?: boolean
  taken: number
  healed: number
  dot?: number
  guts?: boolean
  revive?: boolean
}

export type SceneTheme = 'meadow' | 'forest' | 'desert' | 'night' | 'volcano' | 'tower' | 'event' | 'arena'
export const themeFor = (stage: number, mode?: string): SceneTheme =>
  mode === 'spar' ? 'arena' : mode === 'event' ? 'event' : stage <= 6 ? 'meadow' : stage <= 12 ? 'forest' : stage <= 18 ? 'desert' : stage <= 24 ? 'night' : stage <= 30 ? 'volcano' : 'tower'

/** 近づいて斬る技 / 飛び道具の技 / その場で使う技 */
const MELEE: TbFx[] = ['slash', 'double', 'stab', 'bash', 'shadow', 'poison']
const RANGED: TbFx[] = ['fire', 'ice', 'holy', 'meteor']

/** 1 ターンの時間割 (ミリ秒、速さ 1 のとき) */
export function timeline(b: Beat | null) {
  if (!b) return { me: 0, hit: 0, foe: 0, foeHit: 0, end: 0 }
  const me = b.special ? 760 : 0
  const melee = !!b.fx && MELEE.includes(b.fx)
  const ranged = !!b.fx && RANGED.includes(b.fx)
  const hit = me + (melee ? 190 : ranged ? (b.fx === 'meteor' ? 420 : 340) : 120)
  const multi = Math.max(0, b.hits.length - 1) * 130
  const foe = hit + multi + (b.fx ? 380 : 260)
  const foeHit = foe + (b.foe === 'heavy' ? 260 : 190)
  const end = foeHit + (b.foe === 'none' && !b.dot && !b.healed ? 120 : 460)
  return { me, hit, foe, foeHit, end }
}

const ms = (n: number, k: number) => `${Math.round(n * k)}ms`
/** [名前, 長さ, 遅れ] の並びを animation の値にする (fill しない: 同じ要素で動きを重ねても前の動きを邪魔しない) */
const anims = (list: [string, number, number, string?][], k: number) =>
  list.length ? list.map(([n, d, at, ease]) => `${n} ${ms(d, k)} ${ease ?? 'ease-out'} ${ms(at, k)}`).join(', ') : undefined
const at = (start: number, k: number, extra: CSSProperties = {}): CSSProperties => ({ animationDelay: ms(start, k), ...extra })

/** 飛び散る粒 (角度は番号から決める: 毎回同じ形) */
function Burst({ n, start, k, cls, x, y, spread = 46 }: { n: number; start: number; k: number; cls: string; x: string; y: string; spread?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.4
        const r = spread * (0.6 + ((i * 37) % 10) / 20)
        return <i key={i} className={`fx-p ${cls}`} style={{ left: x, top: y, ['--dx' as string]: `${Math.cos(a) * r}px`, ['--dy' as string]: `${Math.sin(a) * r}px`, animationDelay: ms(start + (i % 3) * 20, k) }} />
      })}
    </>
  )
}

/** 数字 (ダメージ・回復)。i 番目は少しずらして重ならないようにする */
function Num({ children, cls, x, y, start, k, i = 0 }: { children: ReactNode; cls: string; x: number; y: number; start: number; k: number; i?: number }) {
  return (
    <span className={`fx-num ${cls}`} style={{ left: `${x + (i % 2 ? 6 : -4) * Math.min(i, 3)}%`, top: y - i * 16, animationDelay: ms(start, k) }}>
      {children}
    </span>
  )
}

/** 舞台の真ん中に出す言葉 (不屈! など) */
const Callout = ({ text, start, k, cls = '' }: { text: string; start: number; k: number; cls?: string }) => (
  <span className={`fx-call ${cls}`} style={at(start, k)}>
    {text}
  </span>
)

export function BattleScene({
  me,
  foe,
  theme,
  beat,
  step,
  done,
  win,
  speed = 1,
  charging = false,
  aura,
}: {
  me: { name: string; picture?: string; skin?: string | null }
  foe: { icon: string; name: string }
  theme: SceneTheme
  beat: Beat | null
  step: number
  done: boolean
  win: boolean
  /** 再生の速さ (早送りで 2・4) */
  speed?: number
  /** 敵が力をためている (次は強攻撃) */
  charging?: boolean
  /** 自分にかかっている効果 (攻撃アップ・守り) */
  aura?: { atk?: boolean; guard?: boolean }
}) {
  const k = 1 / speed
  const b = beat
  const t = timeline(b)
  const melee = !!b?.fx && MELEE.includes(b.fx)
  const ranged = !!b?.fx && RANGED.includes(b.fx)
  const big = !!b && (b.hits.some((h) => h.crit || h.smash) || !!b.special)
  const foeActs = !!b && (b.foe === 'attack' || b.foe === 'heavy')
  const foeLands = foeActs && !b.dodged
  const lastHit = b ? t.hit + Math.max(0, b.hits.length - 1) * 130 : 0

  // 自分の動き
  const meAnim: [string, number, number, string?][] = []
  if (b && !done) {
    if (melee) meAnim.push(['sc-dash-r', 520 + Math.max(0, b.hits.length - 1) * 130, t.me, 'cubic-bezier(.3,.7,.2,1)'])
    else if (ranged) meAnim.push(['sc-cast', 420, t.me])
    else if (b.fx || b.guard || b.potion) meAnim.push(['sc-hop', 360, t.me])
    if (foeLands && b.taken > 0) meAnim.push([b.foe === 'heavy' ? 'sc-hurt-big' : 'sc-hurt', 380, t.foeHit])
    if (foeActs && b.dodged) meAnim.push(['sc-dodge', 420, t.foeHit - 60])
  }
  // 敵の動き
  const foeAnim: [string, number, number, string?][] = []
  if (b && !done) {
    if (b.hits.length) foeAnim.push([big ? 'sc-knock-big' : 'sc-knock', 360, t.hit])
    for (let i = 1; i < b.hits.length; i++) foeAnim.push(['sc-knock', 260, t.hit + i * 130])
    if (foeActs) foeAnim.push([b.foe === 'heavy' ? 'sc-dash-heavy' : 'sc-dash-l', b.foe === 'heavy' ? 620 : 480, t.foe, 'cubic-bezier(.3,.7,.2,1)'])
    if (b.foe === 'charge' && !b.stunned) foeAnim.push(['sc-swell', 700, t.foe])
    if (b.stunned) foeAnim.push(['sc-wobble', 700, t.foe])
    if (b.dot) foeAnim.push(['sc-knock', 260, t.foeHit + 240])
  }
  // カメラ (ゆれ・寄り)
  const camAnim: [string, number, number, string?][] = []
  if (b && !done) {
    if (b.special) camAnim.push(['sc-zoom', 900, t.me - 60])
    if (big) camAnim.push(['sc-shake', 360, lastHit])
    if (foeLands && b.foe === 'heavy') camAnim.push(['sc-shake-big', 460, t.foeHit])
  }
  const fxX = 74 // 敵の位置 (%)
  const meX = 26

  return (
    <div className={`scene th-${theme} ${done ? (win ? 'won' : 'lost') : ''}`} aria-hidden="true" style={{ ['--k' as string]: k }}>
      {/* 背景 (ゆっくり流れる雲・星など) */}
      <div className="sc-sky" />
      <div className="sc-far" />
      <div className="sc-cloud c1" />
      <div className="sc-cloud c2" />
      <div className="sc-ground" />

      <div key={`cam${step}`} className="sc-cam" style={{ animation: anims(camAnim, k) }}>
        {/* 自分 */}
        <div key={`me${step}`} className={`sc-fighter me ${done && !win ? 'down' : ''}`} style={{ left: `${meX}%`, animation: done ? undefined : anims(meAnim, k) }}>
          <div className="sc-bob">
            {aura?.atk && <span className="sc-aura atk" />}
            {aura?.guard && <span className="sc-aura guard" />}
            <Avatar name={me.name} picture={me.picture} skin={me.skin} size={72} />
          </div>
          <span className="sc-shadow" />
        </div>
        {/* 敵 */}
        <div
          key={`foe${step}`}
          className={`sc-fighter foe ${done && win ? 'shatter' : ''} ${charging && !done ? 'charging' : ''}`}
          style={{ left: `${fxX}%`, animation: done ? undefined : anims(foeAnim, k) }}
        >
          <div className="sc-bob">
            {charging && !done && <span className="sc-aura charge" />}
            <span className="sc-foe-icon">{foe.icon}</span>
          </div>
          <span className="sc-shadow" />
        </div>
        {/* 倒したときは砕け散る */}
        {done && win && (
          <div className="sc-shards" style={{ left: `${fxX}%` }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`sc-shard s${i}`}>
                {foe.icon}
              </span>
            ))}
            <Burst n={12} start={0} k={1} cls="spark" x="0px" y="0px" spread={70} />
          </div>
        )}

        {/* このターンの演出 */}
        {b && !done && (
          <div key={`fx${step}`} className="fx-layer">
            {b.special && (
              <div className="fx-cutin" style={at(0, k)}>
                <div className="fx-cutin-band">
                  <span className="fx-cutin-icon">{b.special.icon}</span>
                  <span className="fx-cutin-name">{b.special.name}</span>
                </div>
              </div>
            )}
            {b.tech && !b.special && (
              <span className="fx-techname" style={at(t.me, k)}>
                {b.tech.icon} {b.tech.name}
              </span>
            )}

            {/* 自分の技 */}
            {b.fx === 'slash' &&
              b.hits.map((h, i) => <span key={i} className={`fx-slash ${h.crit || h.smash || b.special ? 'gold' : ''} ${i % 2 ? 'rev' : ''}`} style={{ left: `${fxX}%`, ...at(t.hit - 40 + i * 130, k) }} />)}
            {b.fx === 'double' && b.hits.map((_, i) => <span key={i} className={`fx-slash ${i % 2 ? 'rev' : ''}`} style={{ left: `${fxX}%`, ...at(t.hit - 40 + i * 130, k) }} />)}
            {b.fx === 'stab' && <span className="fx-stab" style={{ left: `${fxX}%`, ...at(t.hit - 50, k) }} />}
            {b.fx === 'bash' && <span className="fx-ring" style={{ left: `${fxX}%`, ...at(t.hit, k) }} />}
            {b.fx === 'shadow' && (
              <>
                <span className="fx-dark" style={at(t.me, k)} />
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`fx-slash dark ${i % 2 ? 'rev' : ''}`} style={{ left: `${fxX}%`, ...at(t.hit - 40 + i * 70, k) }} />
                ))}
              </>
            )}
            {b.fx === 'poison' && (
              <>
                <span className="fx-slash venom" style={{ left: `${fxX}%`, ...at(t.hit - 40, k) }} />
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="fx-bubble" style={{ left: `${fxX - 6 + i * 3}%`, ...at(t.hit + 80 + i * 60, k) }} />
                ))}
              </>
            )}
            {b.fx === 'fire' && (
              <>
                <span className="fx-ball fire" style={at(t.me + 100, k)} />
                <span className="fx-ring fire" style={{ left: `${fxX}%`, ...at(t.hit, k) }} />
                <Burst n={10} start={t.hit} k={k} cls="ember" x={`${fxX}%`} y="58%" />
              </>
            )}
            {b.fx === 'ice' && (
              <>
                <span className="fx-ball ice" style={at(t.me + 100, k)} />
                <span className="fx-freeze" style={{ left: `${fxX}%`, ...at(t.hit, k) }} />
                <Burst n={8} start={t.hit} k={k} cls="shard" x={`${fxX}%`} y="58%" />
              </>
            )}
            {b.fx === 'holy' && (
              <>
                <span className="fx-pillar" style={{ left: `${fxX}%`, ...at(t.hit - 140, k) }} />
                <Burst n={8} start={t.hit} k={k} cls="spark" x={`${fxX}%`} y="58%" />
              </>
            )}
            {b.fx === 'meteor' &&
              b.hits.map((_, i) => (
                <span key={i} className="fx-meteor" style={{ left: `${fxX - 4 + i * 4}%`, ...at(t.hit - 300 + i * 130, k) }}>
                  <i />
                </span>
              ))}
            {b.fx === 'meteor' && <Burst n={12} start={t.hit} k={k} cls="ember" x={`${fxX}%`} y="60%" spread={60} />}
            {b.fx === 'buff' && (
              <>
                <span className="fx-slash" style={{ left: `${fxX}%`, ...at(t.hit - 40, k) }} />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="fx-flame" style={{ left: `${meX - 7 + i * 3}%`, ...at(t.foe - 260 + (i % 3) * 60, k) }} />
                ))}
              </>
            )}
            {b.fx === 'shield' && (
              <>
                <span className="fx-slash" style={{ left: `${fxX}%`, ...at(t.hit - 40, k) }} />
                <span className="fx-barrier" style={{ left: `${meX}%`, ...at(t.foe - 200, k) }} />
              </>
            )}
            {(b.fx === 'pray' || (b.potion ?? 0) > 0) && (
              <>
                <span className="fx-glow" style={{ left: `${meX}%`, ...at(t.me + 60, k) }} />
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className="fx-sparkle" style={{ left: `${meX - 8 + i * 3.2}%`, ...at(t.me + 80 + (i % 3) * 90, k) }} />
                ))}
              </>
            )}
            {/* 当たったときの火花 */}
            {b.hits.length > 0 && melee && <Burst n={big ? 10 : 6} start={t.hit} k={k} cls={big ? 'spark gold' : 'spark'} x={`${fxX}%`} y="56%" />}
            {b.hits.map((h, i) => (
              <Num key={i} cls={h.crit || h.smash || b.special ? 'crit' : ''} x={fxX} y={30} start={t.hit + i * 130} k={k} i={i}>
                {h.dmg}
                {h.crit ? <small>会心!</small> : h.smash ? <small>渾身!</small> : null}
              </Num>
            ))}
            {(b.potion ?? 0) > 0 && (
              <Num cls="heal" x={meX + 8} y={34} start={t.me + 160} k={k}>
                +{b.potion}
              </Num>
            )}

            {/* 敵の行動 */}
            {b.guard && <span className="fx-barrier blue" style={{ left: `${meX}%`, ...at(t.me + 40, k) }} />}
            {foeLands && <Burst n={b.foe === 'heavy' ? 10 : 6} start={t.foeHit} k={k} cls={b.foe === 'heavy' ? 'ember' : 'spark red'} x={`${meX}%`} y="56%" />}
            {foeLands && b.foe === 'heavy' && <span className="fx-redflash" style={at(t.foeHit, k)} />}
            {foeLands && b.foe === 'heavy' && <span className="fx-ring red" style={{ left: `${meX}%`, ...at(t.foeHit, k) }} />}
            {foeLands && b.taken > 0 && (
              <Num cls="taken" x={meX - 6} y={26} start={t.foeHit} k={k}>
                -{b.taken}
              </Num>
            )}
            {b.foe === 'charge' && !b.stunned && <span className="fx-charge" style={{ left: `${fxX}%`, ...at(t.foe, k) }} />}
            {b.stunned && (
              <span className="fx-stars" style={{ left: `${fxX}%`, ...at(t.foe, k) }}>
                💫
              </span>
            )}
            {(b.dot ?? 0) > 0 && (
              <Num cls="dot" x={fxX + 6} y={52} start={t.foeHit + 240} k={k}>
                -{b.dot}
              </Num>
            )}
            {b.healed > 0 && (
              <Num cls="heal" x={meX + 10} y={52} start={t.foeHit + 260} k={k}>
                +{b.healed}
              </Num>
            )}
            {b.guard && foeLands && <Callout text="ガード!" start={t.foeHit} k={k} cls="blue" />}
            {b.dodged && foeActs && <Callout text="回避!" start={t.foeHit} k={k} cls="green" />}
            {b.stunned && <Callout text={b.foe === 'charge' ? 'ためを崩した!' : 'ひるんだ!'} start={t.foe} k={k} cls="yellow" />}
            {b.foe === 'heavy' && foeLands && !b.guard && <Callout text="強攻撃!" start={t.foe} k={k} cls="red" />}
            {b.guts && <Callout text="不屈!" start={t.foeHit + 200} k={k} cls="yellow" />}
            {b.revive && <Callout text="復活!" start={t.foeHit + 200} k={k} cls="yellow" />}
          </div>
        )}
      </div>
      {done && <span className={`sc-ko ${win ? 'win' : 'lose'}`}>{win ? 'K.O.!' : 'DOWN…'}</span>}
    </div>
  )
}

/** HP バー。delay (ミリ秒) のあとに減り、白い影が少し遅れて追いかける */
export function HpBar({ label, value, max, kind, delay = 0 }: { label: string; value: number; max: number; kind: 'me' | 'enemy'; delay?: number }) {
  const ratio = Math.max(0, value) / max
  return (
    <div className={`hp hp-${kind}`}>
      <span className="hp-label">{label}</span>
      <div className="hp-track">
        <span className="ghost" style={{ transform: `scaleX(${ratio})`, transitionDelay: `${delay + 350}ms` }} />
        <span className="bar" style={{ transform: `scaleX(${ratio})`, transitionDelay: `${delay}ms` }} />
      </div>
      <span className="hp-num">
        {Math.max(0, value)}/{max}
      </span>
    </div>
  )
}

/** 再生の速さ (オートの早送り) */
export const SPEEDS = [1, 2, 4] as const
export const SPEED_KEY = 'flick.battle.speed'
