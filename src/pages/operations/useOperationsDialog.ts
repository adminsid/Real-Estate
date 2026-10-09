import { useEffect, useRef } from 'react'

export function useOperationsDialog(onClose: () => void, busy: boolean) {
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  const locked = useRef(busy)
  close.current = onClose
  locked.current = busy
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0)
    focusables()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !locked.current) {
        event.preventDefault()
        close.current()
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      const first = items[0],
        last = items[items.length - 1]
      if (!first) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [])
  return ref
}
