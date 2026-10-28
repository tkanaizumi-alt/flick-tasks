// 毎日のバックアップ (集計画面から保存した flick-backup-YYYY-MM-DD.json) を、D1 に流し込める SQL に変える
//   node scripts/restore-backup.mjs flick-backup-2026-10-28.json restore.sql [テーブル名 ...]
// テーブル名を付けるとその表だけ。作った SQL は中身を確かめてから
//   npx wrangler d1 execute flick-db --remote --file restore.sql
// で流す。指定した表は中身を入れ替える (DELETE してから INSERT) ので、今のデータは消える
import { readFileSync, writeFileSync } from 'node:fs'

const [src, out, ...only] = process.argv.slice(2)
if (!src || !out) {
  console.error('使い方: node scripts/restore-backup.mjs <バックアップ.json> <出力.sql> [テーブル名 ...]')
  process.exit(1)
}
const backup = JSON.parse(readFileSync(src, 'utf8'))
if (backup.app !== 'flick' || !backup.tables) throw new Error('Flick のバックアップではありません')

const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const names = only.length ? only : Object.keys(backup.tables)
const lines = ['PRAGMA defer_foreign_keys = true;']
for (const name of names) {
  const rows = backup.tables[name]
  if (!rows) throw new Error(`バックアップに ${name} がありません`)
  lines.push(`DELETE FROM "${name}";`)
  for (const r of rows) {
    const cols = Object.keys(r)
    lines.push(`INSERT INTO "${name}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')});`)
  }
  console.log(`${name}: ${rows.length}行`)
}
writeFileSync(out, lines.join('\n') + '\n')
console.log(`\n${out} に書き出しました (${backup.day} の分)`)
