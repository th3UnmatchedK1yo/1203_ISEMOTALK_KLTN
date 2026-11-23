import { useEffect, useRef, useState } from 'react'
import { parseServiceDraft, type DraftFields } from '@/lib/serviceDraft'
import { useServiceNavigationGuard } from './ServiceNavigationGuard'

export function useServiceForm<T extends DraftFields>(key: string, version: number, initial: T) {
  const storageKey = `isemotalk.service.${key}`
  const registerDirty = useServiceNavigationGuard()
  const initialRef = useRef(initial)
  initialRef.current = initial
  const [state, setState] = useState(() => {
    let raw: string | null = null
    try { raw = sessionStorage.getItem(storageKey) } catch { /* Saving remains available. */ }
    const saved = parseServiceDraft(raw, initial)
    return { values: saved?.values ?? initial, baseVersion: saved?.baseVersion ?? version, dirty: !!saved }
  })
  const [storageError, setStorageError] = useState(false)
  const stale = state.dirty && state.baseVersion !== version
  useEffect(() => {
    if (!state.dirty && state.baseVersion !== version) setState({ values: initialRef.current, baseVersion: version, dirty: false })
  }, [version, state.dirty, state.baseVersion])
  useEffect(() => {
    try {
      if (state.dirty) sessionStorage.setItem(storageKey, JSON.stringify({ baseVersion: state.baseVersion, values: state.values }))
      else sessionStorage.removeItem(storageKey)
      setStorageError(false)
    } catch { setStorageError(true) }
  }, [storageKey, state])
  useEffect(() => {
    registerDirty(key, state.dirty)
    return () => registerDirty(key, false)
  }, [registerDirty, key, state.dirty])
  const set = (patch: Partial<T>) => { registerDirty(key, true); setState(s => ({ ...s, values: { ...s.values, ...patch }, dirty: true })) }
  const accept = (values: T, baseVersion = version) => { registerDirty(key, false); setState({ values, baseVersion, dirty: false }) }
  const reset = () => { if (!state.dirty || window.confirm('Bỏ nội dung đang nhập và nạp dữ liệu đã lưu?')) accept(initialRef.current) }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ key, ...state }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'isemotalk-ban-nhap.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return { ...state, stale, storageError, set, accept, reset, download }
}
