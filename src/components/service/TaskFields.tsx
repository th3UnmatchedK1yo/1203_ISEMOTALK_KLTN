import { isoFromLocal, taskLabels, type TaskInput } from '@/api/service'
import { field, label } from './styles'
export interface TaskValues { kind: string; action: string; owner: string; dueAt: string }
export const taskInput = (values: TaskValues): TaskInput => ({ kind: values.kind as TaskInput['kind'], action: values.action, owner: values.owner, dueAt: isoFromLocal(values.dueAt) })
export function TaskFields({ values, set, kindEditable = true }: { values: TaskValues; set: (value: Partial<TaskValues>) => void; kindEditable?: boolean }) {
  return <div className="space-y-4">
    {kindEditable && <label className={label}>Loại việc<select className={field} value={values.kind} onChange={e => set({ kind: e.target.value })}>{Object.entries(taskLabels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
    <label className={label}>Việc cần làm *<textarea required maxLength={2000} rows={2} className={field} value={values.action} onChange={e => set({ action: e.target.value })} placeholder="Ví dụ: Xác minh ngày hoàn tiền với kế toán"/></label>
    <div className="grid gap-4 md:grid-cols-2"><label className={label}>Giao cho *<input required maxLength={120} className={field} value={values.owner} onChange={e => set({ owner: e.target.value })}/></label><label className={label}>Hạn thực hiện *<input type="datetime-local" required className={field} value={values.dueAt} onChange={e => set({ dueAt: e.target.value })}/></label></div>
    <p className="text-sm text-slate-700">Giờ trên thiết bị. Có thể ghi nhận hạn đã qua để theo dõi công việc tồn.</p>
  </div>
}
