// Read-only selection of case studies from actual OneVoice transcripts already
// imported in the isolated FTISU demo DB. Never invent dialogue or QA decisions.
// Prints short previews to help the student choose a truthful demo narrative.
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

if (process.platform !== 'linux') throw Error('Run in the FTISU shell; no audio/database copied to Windows.')
const dir = resolve(process.env.ISEMO_DATA_DIR || join(process.env.HOME || '', 'services/isemotalk-speech-demo'))
const dbFile = join(dir, 'isemotalk.db')
if (!existsSync(dbFile)) throw Error('Speech demo SQLite missing; run remote:speech-demo first.')
const db = new Database(dbFile, { readonly: true, fileMustExist: true })
const topics = [
  {name:'hoàn tiền / thanh toán', keywords:['hoàn tiền', 'refund', 'chuyển khoản', 'thanh toán', 'tiền']},
  {name:'giao hàng / đơn hàng', keywords:['giao hàng', 'đơn hàng', 'ship', 'vận chuyển', 'delivery']},
  {name:'đổi trả / bảo hành', keywords:['đổi trả', 'đổi hàng', 'bảo hành', 'đổi sản phẩm', 'return']},
  {name:'yêu cầu hỗ trợ khác', keywords:[]},
]
const rows = db.prepare(`SELECT c.id,c.title,c.overall_note AS note,
    (SELECT GROUP_CONCAT(text,' ') FROM utterances u WHERE u.call_id=c.id ORDER BY idx) AS transcript
    FROM calls c WHERE c.title LIKE 'TTS TỔNG HỢP · OneVoice%' ORDER BY c.id`).all()
let shown = 0
for (const topic of topics) {
  const found = rows.filter(row => {
    const lower = String(row.transcript || '').toLocaleLowerCase('vi')
    return topic.keywords.some(word => lower.includes(word)) || topic.keywords.length === 0
  }).slice(0, 3)
  if (found.length === 0) continue
  console.log('\n### ' + topic.name)
  for (const row of found) {
    const label = String(row.note || '').match(/Nhãn needs_attention gốc của OneVoice[^:]*:\s*([01])/)?.[1] ?? 'không rõ'
    const excerpt = String(row.transcript || '').replace(/\s+/g, ' ').slice(0, 310)
    console.log(row.id + ' | nhãn nguồn synthetic=' + label + ' | ' + row.title)
    console.log('  Transcript nguồn: ' + excerpt + (excerpt.length >= 310 ? '…' : ''))
    shown++
  }
}
db.close()
console.log('\nSelected ' + shown + ' previews from imported OneVoice only. Check full audio/transcript before choosing a real classroom story.')
console.log('Nhãn nguồn không phải kết quả QA model; chỉ bàn về tình huống có trong chính audio.')
