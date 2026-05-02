import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useCategories } from '../hooks/useCategories'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#0ea5e9', '#94a3b8',
]

export default function Categories() {
  const { categories, loading, addCategory, updateCategory, deleteCategory } = useCategories()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(null)

  return (
    <>
      <Topbar greet={t('cat.title')} date={t('cat.subtitle', { total: categories.length })}>
        <button className="btn primary sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={12} /> {t('cat.addBtn')}
        </button>
      </Topbar>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('cat.loading')}</div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>{t('cat.empty')}</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
        }}>
          {categories.map(c => (
            <CategoryCard key={c.id} category={c} onEdit={setEditing} t={t} />
          ))}
        </div>
      )}

      {editing !== null && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async ({ name, color }) => {
            if (editing === 'new') await addCategory(name, color)
            else await updateCategory(editing.id, { name: name.trim(), color })
            setEditing(null)
          }}
          onDelete={async (id) => {
            await deleteCategory(id)
            setEditing(null)
          }}
          t={t}
        />
      )}
    </>
  )
}

function CategoryCard({ category: c, onEdit, t }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `${c.color || '#94a3b8'}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: c.color || '#94a3b8' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: 'var(--ink-0)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.name}
        </div>
      </div>
      <button className="icon-btn sm-btn" title={t('cat.modal.titleEdit')} onClick={() => onEdit(c)}>
        <Icon name="edit" size={14} />
      </button>
    </div>
  )
}

function CategoryModal({ category, onClose, onSave, onDelete, t }) {
  const [name,    setName]    = useState(category?.name  || '')
  const [color,   setColor]   = useState(category?.color || PRESET_COLORS[0])
  const [saving,  setSaving]  = useState(false)
  const [delStep, setDelStep] = useState(0)
  const [error,   setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError(t('cat.modal.required')); return }
    setSaving(true); setError(null)
    try {
      await onSave({ name, color })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (delStep === 0) { setDelStep(1); return }
    setSaving(true)
    try { await onDelete(category.id) }
    catch (err) { setError(err.message); setSaving(false) }
  }

  return (
    <Modal title={category ? t('cat.modal.titleEdit') : t('cat.modal.titleNew')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="modal-body">
          <div className="form-grid">

            <div className="form-field span-2">
              <label>{t('cat.modal.name')}</label>
              <input type="text" placeholder={t('cat.modal.namePlaceholder')}
                value={name} onChange={e => { setName(e.target.value); setDelStep(0) }} required />
            </div>

            <div className="form-field span-2">
              <label>{t('cat.modal.color')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {PRESET_COLORS.map(pc => (
                  <button key={pc} type="button"
                    onClick={() => setColor(pc)}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: pc, border: 'none', cursor: 'pointer', flexShrink: 0,
                      outline: color === pc ? `3px solid ${pc}` : '3px solid transparent',
                      outlineOffset: 2,
                      transform: color === pc ? 'scale(1.15)' : 'scale(1)',
                      transition: 'transform .15s, outline .15s',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{t('cat.modal.customColor')}</span>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  style={{ width: 36, height: 28, padding: 2, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--ink-2)',
                }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {color}
                </span>
              </div>
            </div>

          </div>
          {error && <p style={{ color: 'var(--neg)', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {category && (
            <button type="button" disabled={saving}
              className="btn ghost"
              onClick={handleDelete}
              style={{ marginRight: 'auto', color: 'var(--neg)' }}>
              {delStep === 1 ? t('cat.modal.confirmDelete') : t('cat.modal.delete')}
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>{t('cat.modal.cancel')}</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? t('cat.modal.saving') : category ? t('cat.modal.saveEdit') : t('cat.modal.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
