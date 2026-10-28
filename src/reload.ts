/**
 * 新しい版を公開すると、古い画面が後から読み込む部品 (assets/*.js) はもう無い。
 * そのときは 1 回だけページを読み直して新しい版にする (読み直しても直らないときは繰り返さない)
 */
const KEY = 'flick.reloadedAt'

export function reloadForNewVersion() {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {}
  location.reload()
  return true
}

/** 部品の動的な読み込み。失敗したら新しい版に読み直す */
export function retryImport<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((e) => {
      // 読み直している間は何も描かない (読み直さないときは元のエラーにする)
      if (reloadForNewVersion()) return new Promise<T>(() => {})
      throw e
    })
}
