import { contactLabels, directionLabels, isoFromLocal, type ContactInput } from '@/api/service'
import { field, label } from './styles'
import { localDateTime } from '@/api/workflow'

export interface ContactValues { disposition: string; direction: string; occurredAt: string; externalContactId: string; note: string; callId: string }
export function contactInput(values: ContactValues): ContactInput {
  return { disposition: values.disposition as ContactInput['disposition'], direction: values.direction as ContactInput['direction'], occurredAt: isoFromLocal(values.occurredAt), externalContactId: values.externalContactId, note: values.note, ...(values.disposition === 'recording' ? { callId: values.callId.trim() } : {}) }
}
export function ContactFields({ values, set }: { values: ContactValues; set: (value: Partial<ContactValues>) => void }) {
  return <div className="space-y-4">
    <div className="grid gap-4 md:grid-cols-2"><label className={label}>Kết quả liên hệ<select className={field} value={values.disposition} onChange={e => set({ disposition: e.target.value })}>{Object.entries(contactLabels).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label><label className={label}>Chiều liên hệ<select className={field} value={values.direction} onChange={e => set({ direction: e.target.value })}>{Object.entries(directionLabels).map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></label></div>
    {values.disposition === 'recording' ? <label className={label}>Mã cuộc gọi trong ISEmoTalk *<input className={field} required maxLength={100} value={values.callId} onChange={e => set({ callId: e.target.value })} placeholder="Lấy mã CALL-… ở trang Cuộc gọi"/><span className="mt-1 block text-sm font-normal text-slate-700">Mỗi hồ sơ cuộc gọi liên kết với một vụ việc chính. Hồ sơ nhập kết quả có thể chưa có tệp âm thanh; mở trang QA để kiểm tra nguồn dữ liệu.</span></label> : <p className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">Nhập thủ công · Chưa có bản ghi gắn với lần liên hệ này, nên không có phân tích cảm xúc.</p>}
    {values.disposition === 'agent_unanswered' && <p className="text-sm text-amber-900">Chỉ ghi nhận một nhân viên không nhận lượt gọi; khách có thể đã được tổng đài chuyển cho người khác.</p>}
    <div className="grid gap-4 md:grid-cols-2"><div><label className={label}>Thời điểm liên hệ *<input type="datetime-local" className={field} required value={values.occurredAt} onChange={e => set({ occurredAt: e.target.value })}/></label><button type="button" className="mt-2 text-sm font-semibold text-teal-900 underline" onClick={() => set({ occurredAt: localDateTime(new Date().toISOString()) })}>Dùng giờ hiện tại</button></div><label className={label}>Mã liên hệ ở tổng đài<input className={field} maxLength={160} value={values.externalContactId} onChange={e => set({ externalContactId: e.target.value })} placeholder="Nếu có"/></label></div>
    <label className={label}>Ghi chú liên hệ<textarea rows={2} className={field} maxLength={2000} value={values.note} onChange={e => set({ note: e.target.value })}/></label>
  </div>
}
