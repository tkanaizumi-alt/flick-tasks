/** この端末に残す設定・キャッシュ (localStorage が使えない環境でも落ちないようにする) */
export const store = {
  get<T>(k: string, fallback: T): T {
    try {
      const v = localStorage.getItem(k)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem(k)
    } catch {}
  },
}
