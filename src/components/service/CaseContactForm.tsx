import { useMemo, type FormEvent } from 'react'
import { addContact, type ServiceCase } from '@/api/service'
import { ContactFields, contactInput } from './ContactFields'
import { FormNotice } from './FormNotice'
import { useServiceForm } from './useServiceForm'
import { primary } from './styles'
import type { Perform } from './CaseEditor'

export function CaseContactForm({ record, actor, busy, perform }: { record: ServiceCase; actor: string; busy: boolean; perform: Perform }) {
  const initial = useMemo(() => ({ disposition: 'recording', direction: 'unknown', occurredAt: '', externalContactId: '', note: '', callId: '' }), [])
  const form = useServiceForm(`contact-${record.id}`, record.version, initial)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await perform(() => addContact(record.id, { ...contactInput(form.values), actor, baseVersion: form.baseVersion }), 'Đã ghi nhận lần liên hệ và nguồn dữ liệu.')
    if (result) form.accept(initial, result.case.version)
  }
  return <form className="mt-4 space-y-4" onSubmit={event => void submit(event)}><FormNotice {...form}/><fieldset className="min-w-0 space-y-4 disabled:opacity-70" disabled={busy || form.stale}><ContactFields values={form.values} set={form.set}/><button className={primary} disabled={busy || !actor.trim()} type="submit">Lưu lần liên hệ</button></fieldset></form>
}
