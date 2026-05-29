import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { useCategories, buildCategoryTree } from '../hooks/useCategories'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#0ea5e9', '#94a3b8',
]

const TAX_LINES = [
  'Medical', 'Donations', 'Home Office', 'Childcare',
  'Professional Dues', 'Moving', 'Other',
]

export default function Categories() {
  const { categories, loading, addCategory, updateCategory, deleteCategory } = useCategories()
  const { t } = useTranslation()
  const [editing, setEditing] = useState(null) // null | 'new' | category obj
  const [defaultParent, setDefaultParent] = useState(null) // pre-fill parent when clicking "Add subcategory"

  const { parents, childrenOf } = useMemo(() => buildCategoryTree(categories), [categories])

  function openNew(parentId = null) {
    setDefaultParent(parentId)
    setEditing('new')
  }

  return (
    <>
      <Topbar greet={t('cat.title')} date={t('cat.subtitle', { total: categories.length })}>
        <button className="btn primary sm" onClick={() => openNew()}>
          <Icon name="plus" size={12} /> {t('cat.addBtn')}
        </button>
      </Topbar>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-3)' }}>{t('cat.loading')}</div>
      ) : categories.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-3)' }}>{t('cat.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parents.map(parent => {
            const children = childrenOf[parent.id] || []
            return (
              <div key={parent.id}>
                {/* Parent card */}
                <CategoryCard
                  category={parent}
                  isParent
                  childCount={children.length}
                  onEdit={setEditing}
                  onAddChild={() => openNew(parent.id)}
                  t={t}
                />
                {/* Children indented below */}
                {children.length > 0 && (
                  <div style={{ marginLeft: 28, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {children.map(child => (
                      <CategoryCard
                        key={child.id}
                        category={child}
                        isParent={false}
                        childCount={0}
                        onEdit={setEditing}
                        onAddChild={null}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editing !== null && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          defaultParentId={editing === 'new' ? defaultParent : undefined}
          parents={parents}
          onClose={() => { setEditing(null); setDefaultParent(null) }}
          onSave={async ({ name, color, is_tax_deductible, tax_line, parent_id }) => {
            if (editing === 'new') await addCategory(name, color, is_tax_deductible, tax_line, parent_id || null)
            else await updateCategory(editing.id, { name: name.trim(), color, is_tax_deductible, tax_line, parent_id: parent_id || null })
            setEditing(null)
            setDefaultParent(null)
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

function CategoryCard({ category: c, isParent, childCount, onEdit, onAddChild, t }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${isParent ? 'var(--line)' : 'var(--line)'}`,
      borderLeft: !isParent ? `3px solid ${c.color || '#94a3b8'}` : '1px solid var(--line)',
      borderRadius: 'var(--r-md)',
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{
        width: isParent ? 34 : 28, height: isParent ? 34 : 28,
        borderRadius: isParent ? 10 : 7, flexShrink: 0,
        background: `${c.color || '#94a3b8'}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: isParent ? 13 : 10, height: isParent ? 13 : 10, borderRadius: '50%', background: c.color || '#94a3b8' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: isParent ? 13.5 : 12.5, fontWeight: isParent ? 600 : 500,
          color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {c.name}
          {isParent && childCount > 0 && (
            <span style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 400, marginLeft: 6 }}>
              {childCount} {t('cat.subcategories')}
            </span>
          )}
        </div>
        {c.is_tax_deductible && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>🍁</span>
            <span>{c.tax_line || t('cat.taxDeductible')}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {isParent && onAddChild && (
          <button className="icon-btn sm-btn" title={t('cat.addSubcategory')} onClick={onAddChild}>
            <Icon name="plus" size={12} />
          </button>
        )}
        <button className="icon-btn sm-btn" title={t('cat.modal.titleEdit')} onClick={() => onEdit(c)}>
          <Icon name="edit" size={14} />
        </button>
      </div>
    </div>
  )
}

function CategoryModal({ category, defaultParentId, parents, onClose, onSave, onDelete, t }) {
  const [name,       setName]       = useState(category?.name              || '')
  const [color,      setColor]      = useState(category?.color             || PRESET_COLORS[0])
  const [parentId,   setParentId]   = useState(
    category !== null ? (category?.parent_id || '') : (defaultParentId || '')
  )
  const [isTax,      setIsTax]      = useState(category?.is_tax_deductible || false)
  const [taxLine,    setTaxLine]    = useState(category?.tax_line          || '')
  const [saving,     setSaving]     = useState(false)
  const [delStep,    setDelStep]    = useState(0)
  const [error,      setError]      = useState(null)

  // Can only set parent to a top-level category (no grandchildren)
  const parentOptions = parents.filter(p => !p.parent_id && (!category || p.id !== category.id))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError(t('cat.modal.required')); return }
    setSaving(true); setError(null)
    try {
      await onSave({ name, color, is_tax_deductible: isTax, tax_line: isTax ? (taxLine || null) : null, parent_id: parentId || null })
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
              <label>{t('cat.parent')}</label>
              <select value={parentId} onChange={e => setParentId(e.target.value)}>
                <option value="">{t('cat.parentNone')}</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
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

            <div className="form-field span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={isTax}
                  onChange={e => { setIsTax(e.target.checked); if (!e.target.checked) setTaxLine('') }}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span>🍁 {t('cat.taxDeductible')}</span>
              </label>
            </div>

            {isTax && (
              <div className="form-field span-2">
                <label>{t('cat.taxLine')}</label>
                <select value={taxLine} onChange={e => setTaxLine(e.target.value)}
                  style={{ width: '100%' }}>
                  <option value="">— {t('cat.taxLineSelect')} —</option>
                  {TAX_LINES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}

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
