import { useEffect, useRef, useId } from 'react'
import Icon from './Icon'

export default function Modal({ title, onClose, children, wide }) {
  const cardRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  // Focus trap
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    card.focus()
    const trap = (e) => {
      if (e.key !== 'Tab') return
      const focusable = card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    card.addEventListener('keydown', trap)
    return () => card.removeEventListener('keydown', trap)
  }, [])

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={cardRef}
        className={`modal-card ${wide ? 'modal-wide' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
