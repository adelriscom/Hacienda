import Icon from './Icon'

export default function Topbar({ greet, date, action = 'Nuevo movimiento', onAction }) {
  return (
    <div className="topbar">
      <div className="greet">
        <h1>{greet}</h1>
        <p>{date}</p>
      </div>
      <div className="topbar-spacer" />
      <div className="search">
        <Icon name="search" size={14} className="ico" />
        <input placeholder="Buscar transacción, categoría…" />
      </div>
      <button className="icon-btn"><Icon name="bell" size={15} /><span className="dot" /></button>
      <button className="btn primary" onClick={onAction}>
        <Icon name="plus" size={14} /> {action}
      </button>
    </div>
  )
}
