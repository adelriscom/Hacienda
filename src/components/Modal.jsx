import { useEffect } from 'react'
import Icon from './Icon'

export default function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card ${wide ? 'modal-wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
