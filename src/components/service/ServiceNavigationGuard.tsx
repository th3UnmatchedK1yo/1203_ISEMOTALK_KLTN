import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useBlocker, type BlockerFunction } from 'react-router-dom'

const GuardContext = createContext<(key: string, dirty: boolean) => void>(() => undefined)
const DirtyContext = createContext<(key: string) => boolean>(() => false)
export const useServiceNavigationGuard = () => useContext(GuardContext)
export const useServiceHasUnsaved = () => useContext(DirtyContext)

/** One router guard covers links, programmatic navigation and browser Back/Forward. */
export function ServiceNavigationGuard({ children }: { children: ReactNode }) {
  const dirty = useRef(new Set<string>())
  const register = useCallback((key: string, value: boolean) => { if (value) dirty.current.add(key); else dirty.current.delete(key) }, [])
  const hasUnsaved = useCallback((key: string) => dirty.current.has(key), [])
  const blocker = useBlocker(useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => dirty.current.size > 0 && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), []))
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('Bạn có nội dung chưa lưu. Rời trang? Nếu trình duyệt không giữ được bản nháp, nội dung này sẽ bị mất.')) blocker.proceed()
    else blocker.reset()
  }, [blocker])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current.size) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    return () => window.removeEventListener('beforeunload', unload)
  }, [])
  return <GuardContext.Provider value={register}><DirtyContext.Provider value={hasUnsaved}>{children}</DirtyContext.Provider></GuardContext.Provider>
}
