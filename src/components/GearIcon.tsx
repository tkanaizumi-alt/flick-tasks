import type { Rarity, Slot } from '../../shared/game'

/** 部位ごとの形 (兜 / 鎧 / 靴 / 剣)。色はレア度 (CSS の --rc) で塗る */
const PATHS: Record<Slot, string> = {
  head: 'M4 15a8 8 0 0116 0v3H4zM12 7V4M9 18v-4h6v4M2.5 18h19',
  body: 'M8 3l4 2 4-2 4 3-2 4v10H6V10L4 6zM12 5v15M8 11h8',
  feet: 'M7 3h5v9l7 3.5V20H5V3M5 16h14M9 7h3',
  weapon: 'M14.5 3H21v6.5L10.5 20 4 13.5zM6.5 16.5L3 20M5 12l7 7M14 10l-3 3',
}

export function GearIcon({ slot, rarity, size = 28 }: { slot: Slot; rarity?: Rarity; size?: number }) {
  return (
    <svg
      className={`gear-icon ${rarity ? `r-${rarity}` : 'vacant'}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[slot]} />
    </svg>
  )
}
