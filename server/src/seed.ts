// Demo data for development. EVERY call created here is flagged provenance = "mock" so the UI
// never presents it as real model output. Audio is a synthetic buzz shaped by each utterance's
// speaker/emotion — it exists only so the player/waveform can be exercised, it is not speech.
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config'
import type { DB } from './db'
import type { Emotion, Prediction, Speaker, StageEntry } from './domain'
import * as repo from './repo'
import type { NewUtterance } from './repo'

const E: Record<string, Emotion> = { n: 'neutral', h: 'happy', s: 'sad', a: 'angry' }
const P = (e: string, c: number): Prediction => ({ emotion: E[e], confidence: c / 100 })

type Row = [Speaker, number, number, string, string, number, string, number, string, number]
// speaker, start, end, text, fused, conf, acoustic, conf, lexical, conf
const SHOWCASE: Row[] = [
  ['agent', 0, 8, 'Cảm ơn bạn đã gọi đến dịch vụ khách hàng, tôi là Minh từ phòng hỗ trợ. Tôi có thể giúp gì cho bạn hôm nay?', 'n', 78, 'n', 82, 'n', 74],
  ['customer', 8, 14, 'Chào bạn. Tôi muốn hỏi về đơn hàng #45892 của tôi.', 'n', 81, 'n', 79, 'n', 83],
  ['agent', 14, 22, 'Dạ, để tôi kiểm tra thông tin đơn hàng cho bạn. Bạn cho tôi xin mã đơn hàng chính xác nhé.', 'n', 85, 'n', 88, 'n', 82],
  ['customer', 22, 30, 'Đơn hàng 45892, tôi đặt cách đây 5 ngày rồi mà vẫn chưa thấy giao.', 's', 64, 'n', 61, 's', 68],
  ['agent', 30, 38, 'Tôi hiểu, 5 ngày chờ đợi thì đúng là lâu. Để tôi kiểm tra trạng thái đơn hàng cho bạn ngay.', 's', 58, 'n', 62, 's', 55],
  ['agent', 38, 48, 'Tôi thấy đơn hàng của bạn đang ở trạng thái chờ xác nhận thanh toán. Có vẻ như thanh toán chưa được xử lý thành công.', 'n', 72, 'n', 75, 'n', 70],
  ['customer', 48, 62, 'Tôi đã thanh toán rồi! Tôi đã gọi ba lần rồi mà vấn đề vẫn chưa được giải quyết. Lần nào cũng nói đang kiểm tra, đợi, chờ...', 'a', 91, 'a', 94, 'a', 88],
  ['agent', 62, 72, 'Tôi rất xin lỗi vì sự bất tiện này. Việc bạn phải gọi nhiều lần là điều không nên xảy ra. Để tôi kiểm tra kỹ hơn.', 's', 67, 'n', 58, 's', 75],
  ['agent', 72, 84, 'Tôi thấy giao dịch của bạn đã được thanh toán nhưng hệ thống chưa cập nhật. Tôi sẽ xử lý thủ công để đơn hàng được chuyển đi ngay.', 'h', 71, 'n', 64, 'h', 78],
  ['customer', 84, 92, 'Hứa hẹn thì nhiều rồi. Lần trước cũng nói vậy mà không có gì xảy ra.', 'a', 72, 's', 81, 'a', 63],
  ['agent', 92, 104, 'Tôi cam kết với bạn. Đơn hàng sẽ được giao trong 24 giờ tới. Tôi sẽ gửi email xác nhận và mã theo dõi cho bạn trong 15 phút.', 'n', 74, 'h', 68, 'n', 80],
  ['customer', 104, 112, 'Ước gì lần nào cũng được như vậy. Hy vọng lần này là thật.', 'n', 52, 's', 61, 'n', 43],
  ['agent', 112, 122, 'Tôi hiểu tại sao bạn không tin. Tôi sẽ cập nhật trực tiếp cho bạn ngay khi đơn hàng được giao cho đơn vị vận chuyển.', 'h', 68, 'n', 59, 'h', 77],
  ['customer', 122, 130, 'Được rồi, tôi tin bạn lần này. Cảm ơn vì đã hỗ trợ nhiệt tình.', 'h', 82, 'h', 85, 'h', 79],
  ['agent', 130, 140, 'Cảm ơn bạn đã kiên nhẫn. Tôi đã gửi email xác nhận. Nếu có gì thêm, bạn cứ liên hệ nhé. Chúc bạn một ngày tốt lành!', 'h', 86, 'h', 83, 'h', 89],
  ['customer', 140, 146, 'Cảm ơn bạn Minh. Chúc bạn cũng vậy!', 'h', 89, 'h', 91, 'h', 87],
]

const AGENTS = ['Nguyễn Minh Tuấn', 'Trần Thị Lan', 'Lê Hoàng Nam', 'Phạm Thu Hà']
const CUSTOMERS = ['Hoàng Văn An', 'Đặng Minh Châu', 'Lý Thị Mai', 'Vũ Đức Minh', 'Bùi Quang Huy', 'Ngô Thanh Thảo', 'Đỗ Thị Hạnh']

const POOLS = {
  open: ['Cảm ơn bạn đã gọi đến tổng đài, tôi có thể hỗ trợ gì cho bạn?', 'Xin chào, tôi là nhân viên chăm sóc khách hàng, bạn cần hỗ trợ vấn đề gì ạ?'],
  issue: ['Tôi muốn hỏi về khoản phí lạ trong hóa đơn tháng này.', 'Gói cước của tôi bị tính sai mấy tháng liền rồi.', 'Chiếc điện thoại tôi mua tuần trước đã bị lỗi màn hình.', 'Tôi chưa nhận được hàng dù đã quá hạn giao.'],
  check: ['Dạ để tôi kiểm tra thông tin giúp bạn ngay.', 'Bạn vui lòng chờ tôi một chút để tra cứu nhé.'],
  angry: ['Tôi đã gọi bao nhiêu lần rồi mà vẫn không ai giải quyết!', 'Các anh làm ăn kiểu gì vậy, tôi rất bực mình.', 'Tôi không chấp nhận cách xử lý này.'],
  sad: ['Tôi thật sự thất vọng về dịch vụ lần này.', 'Tôi đã chờ rất lâu và cảm thấy không được quan tâm.'],
  empathy: ['Tôi rất xin lỗi vì sự bất tiện này, tôi sẽ ưu tiên xử lý cho bạn.', 'Tôi hiểu sự khó chịu của bạn, để tôi báo cáo bộ phận liên quan ngay.'],
  fix: ['Tôi đã xử lý xong, bạn sẽ nhận được xác nhận qua tin nhắn trong 15 phút.', 'Hệ thống đã hoàn lại khoản phí, bạn kiểm tra giúp tôi nhé.'],
  thanks: ['Vâng, cảm ơn bạn đã hỗ trợ nhiệt tình.', 'Được rồi, như vậy là ổn, cảm ơn bạn.'],
  close: ['Cảm ơn bạn đã kiên nhẫn, chúc bạn một ngày tốt lành!'],
}
type Pool = keyof typeof POOLS
type Step = [Speaker, Pool, string]
const SCENARIOS: Record<string, Step[]> = {
  calm: [['agent', 'open', 'n'], ['customer', 'issue', 'n'], ['agent', 'check', 'n'], ['agent', 'fix', 'h'], ['customer', 'thanks', 'h'], ['agent', 'close', 'h']],
  escalation: [['agent', 'open', 'n'], ['customer', 'issue', 'n'], ['agent', 'check', 'n'], ['customer', 'angry', 'a'], ['agent', 'empathy', 'n'], ['customer', 'angry', 'a'], ['agent', 'fix', 'n'], ['customer', 'thanks', 'n'], ['agent', 'close', 'h']],
  unresolved: [['agent', 'open', 'n'], ['customer', 'issue', 's'], ['agent', 'check', 'n'], ['customer', 'sad', 's'], ['agent', 'empathy', 'n'], ['customer', 'angry', 'a'], ['customer', 'angry', 'a'], ['agent', 'check', 'n'], ['customer', 'angry', 'a']],
  disappointed: [['agent', 'open', 'n'], ['customer', 'issue', 's'], ['agent', 'check', 'n'], ['customer', 'sad', 's'], ['agent', 'fix', 'n'], ['customer', 'thanks', 'n'], ['agent', 'close', 'h']],
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function scenarioUtterances(name: string, rand: () => number): NewUtterance[] {
  let t = 0
  return SCENARIOS[name].map(([speaker, pool, em]) => {
    const text = POOLS[pool][Math.floor(rand() * POOLS[pool].length)]
    const dur = 5 + Math.round(rand() * 9)
    const start = t
    t += dur
    const conf = 55 + Math.round(rand() * 38)
    const fused = P(em, conf)
    const conflict = rand() < 0.15
    const acoustic = conflict ? P(em === 'n' ? 's' : 'n', 50 + Math.round(rand() * 35)) : P(em, Math.min(97, conf + Math.round(rand() * 10 - 5)))
    const lexical = P(em, Math.min(97, conf + Math.round(rand() * 10 - 5)))
    return { speaker, text, start, end: t, acoustic, lexical, fused }
  })
}

// --- synthetic audio -------------------------------------------------------
const RATE = 8000
function synthesize(utts: NewUtterance[], duration: number): { wav: Buffer; peaks: number[] } {
  const n = Math.ceil(duration * RATE)
  const samples = new Int16Array(n)
  let k = 0
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    while (k < utts.length - 1 && t >= utts[k].end) k++
    const u = utts[k]
    let v = (Math.sin(i * 12.9898) * 43758.5453) % 1 // faint room noise
    v *= 0.004
    if (u && t >= u.start && t < u.end) {
      const f0 = u.speaker === 'agent' ? 118 : 175
      const level = u.fused?.emotion === 'angry' ? 0.42 : u.fused?.emotion === 'sad' ? 0.2 : u.fused?.emotion === 'happy' ? 0.3 : 0.26
      const syll = 0.5 * (1 + Math.sin(2 * Math.PI * 3.4 * (t - u.start)))
      const edge = Math.min(1, (t - u.start) * 8, (u.end - t) * 8)
      const ph = 2 * Math.PI * f0 * t
      v += level * syll * edge * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) * 0.55
    }
    samples[i] = Math.max(-1, Math.min(1, v)) * 32767
  }
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34)
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40)
  Buffer.from(samples.buffer).copy(buf, 44)

  const BINS = 400
  const per = Math.max(1, Math.floor(n / BINS))
  const peaks: number[] = []
  for (let b = 0; b < BINS; b++) {
    let m = 0
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) m = Math.max(m, Math.abs(samples[i]))
    peaks.push(Number((m / 32767).toFixed(3)))
  }
  const top = Math.max(...peaks, 0.001)
  return { wav: buf, peaks: peaks.map((p) => Number((p / top).toFixed(3))) }
}

// --- seeding ---------------------------------------------------------------
const DONE: StageEntry[] = [
  { stage: 'validate', state: 'skipped', detail: 'Dữ liệu mô phỏng' },
  { stage: 'transcribe', state: 'skipped', detail: 'Dữ liệu mô phỏng' },
  { stage: 'diarize', state: 'skipped', detail: 'Dữ liệu mô phỏng' },
  { stage: 'emotion', state: 'skipped', detail: 'Dữ liệu mô phỏng' },
  { stage: 'finalize', state: 'done' },
]

export function seedDemo(db: DB, config: Config, { reset = false } = {}): { created: number } {
  if (reset) {
    db.prepare("DELETE FROM calls WHERE provenance = 'mock' AND source = 'results_import'").run()
  } else if ((db.prepare("SELECT COUNT(*) AS n FROM calls WHERE provenance = 'mock'").get() as { n: number }).n > 0) {
    return { created: 0 }
  }
  const rand = rng(20260101)
  const now = Date.now()
  let created = 0

  const plans: Array<{ title: string; utts: NewUtterance[]; review: 'none' | 'partial' | 'done'; daysAgo: number; agent: string; customer: string }> = []
  plans.push({
    title: 'Đơn hàng #45892 chưa giao',
    utts: SHOWCASE.map(([speaker, start, end, text, f, fc, a, ac, l, lc]) => ({ speaker, start, end, text, fused: P(f, fc), acoustic: P(a, ac), lexical: P(l, lc) })),
    review: 'none', daysAgo: 0, agent: AGENTS[0], customer: CUSTOMERS[0],
  })
  const names = Object.keys(SCENARIOS)
  const titles = ['Khiếu nại phí hóa đơn', 'Hỏi gói cước', 'Lỗi thiết bị sau mua', 'Yêu cầu hoàn tiền', 'Chậm giao hàng', 'Cập nhật thông tin', 'Khiếu nại thái độ phục vụ', 'Đổi trả sản phẩm', 'Tư vấn nâng cấp', 'Sự cố thanh toán', 'Hỏi tiến độ bảo hành']
  titles.forEach((title, i) => {
    plans.push({
      title,
      utts: scenarioUtterances(names[i % names.length], rand),
      review: i % 4 === 1 ? 'done' : i % 4 === 3 ? 'partial' : 'none',
      daysAgo: 1 + Math.floor(i * 1.1),
      agent: AGENTS[i % AGENTS.length],
      customer: CUSTOMERS[(i + 1) % CUSTOMERS.length],
    })
  })

  for (const plan of plans) {
    const id = repo.nextCallId(db)
    const duration = plan.utts[plan.utts.length - 1].end
    const { wav, peaks } = synthesize(plan.utts, duration)
    const dir = path.join(config.uploadsDir, id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'audio.wav'), wav)

    const date = new Date(now - plan.daysAgo * 86400_000)
    date.setHours(8 + Math.floor(rand() * 9), Math.floor(rand() * 60), 0, 0)
    repo.insertCall(db, {
      id, title: plan.title, agentName: plan.agent, customerName: plan.customer, callDate: date.toISOString(),
      source: 'results_import', agentChannel: 0, audioFile: path.join(id, 'audio.wav'), audioName: 'demo-audio.wav',
      audioMime: 'audio/wav', provenance: 'mock', speakerSource: 'mock', stageLog: DONE,
    })
    repo.replaceUtterances(db, id, plan.utts)
    repo.updateCall(db, id, { duration, peaks, channels: 1, status: 'ready', progress: 100, stage: null })
    repo.refreshDerived(db, id)

    if (plan.review !== 'none') {
      const list = repo.getUtterances(db, id)
      const upto = plan.review === 'done' ? list.length : Math.ceil(list.length / 2)
      const upd = db.prepare('UPDATE utterances SET review_decision=?, review_emotion=? WHERE call_id=? AND id=?')
      list.slice(0, upto).forEach((u) => {
        if (!u.fused) return
        if (rand() < 0.2) {
          const other = (['neutral', 'happy', 'sad', 'angry'] as Emotion[]).filter((e) => e !== u.fused!.emotion)[Math.floor(rand() * 3)]
          upd.run('corrected', other, id, u.id)
        } else upd.run('confirmed', null, id, u.id)
      })
      repo.updateCall(db, id, {
        reviewStatus: plan.review === 'done' ? 'reviewed' : 'in_progress',
        reviewedAt: plan.review === 'done' ? new Date().toISOString() : null,
        version: 2,
      })
    }
    created++
  }

  // One failed call, so the failure/retry state is visible in the UI.
  const failId = repo.nextCallId(db)
  repo.insertCall(db, {
    id: failId, title: 'Bản ghi bị lỗi ASR', agentName: AGENTS[2], customerName: CUSTOMERS[3],
    callDate: new Date(now - 3600_000).toISOString(), source: 'upload', agentChannel: 0, provenance: 'mock',
    stageLog: [
      { stage: 'validate', state: 'done', detail: '95.0 giây · mono · 16000 Hz' },
      { stage: 'transcribe', state: 'failed', detail: 'Không phát hiện lời nói trong bản ghi âm.' },
      { stage: 'diarize', state: 'pending' }, { stage: 'emotion', state: 'pending' }, { stage: 'finalize', state: 'pending' },
    ],
  })
  repo.updateCall(db, failId, { status: 'failed', stage: 'transcribe', error: 'Không phát hiện lời nói trong bản ghi âm.', progress: 10 })
  return { created: created + 1 }
}
