import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MOCK = [
  { id: '1', occurred_at: '2026-04-24T14:32:00Z', description: 'Mercado Central',       category: { name: 'Alimentación', color: 'var(--cat-food)' },     account: { name: 'BBVA •• 4821' },  amount: -84.50,  status: 'match',  tag: null },
  { id: '2', occurred_at: '2026-04-24T09:15:00Z', description: 'Spotify Premium',        category: { name: 'Servicios',    color: 'var(--cat-services)' }, account: { name: 'Tarjeta Oro' },   amount: -9.99,   status: 'match',  tag: { kind: 'ok', txt: 'Recurrente' } },
  { id: '3', occurred_at: '2026-04-23T19:48:00Z', description: 'Uber',                   category: { name: 'Transporte',   color: 'var(--cat-transport)' },account: { name: 'Tarjeta Oro' },   amount: -12.40,  status: 'match',  tag: null },
  { id: '4', occurred_at: '2026-04-23T13:00:00Z', description: 'Nómina · Acme Corp',     category: { name: 'Salario',      color: 'var(--pos)' },           account: { name: 'BBVA •• 4821' },  amount: 3210.00, status: 'match',  tag: { kind: 'income', txt: 'Ingreso' } },
  { id: '5', occurred_at: '2026-04-22T20:14:00Z', description: 'Newsletter Pro',          category: { name: 'Servicios',    color: 'var(--cat-services)' }, account: { name: 'Tarjeta Oro' },   amount: -12.99,  status: 'ghost',  tag: { kind: 'ghost', txt: 'Cargo fantasma' } },
  { id: '6', occurred_at: '2026-04-22T12:30:00Z', description: 'Farmacia San Pablo',      category: { name: 'Salud',        color: 'var(--cat-health)' },   account: { name: 'Efectivo' },      amount: -28.10,  status: 'review', tag: { kind: 'warn', txt: 'Por revisar' } },
  { id: '7', occurred_at: '2026-04-21T18:02:00Z', description: 'Transferencia → Ahorro', category: { name: 'Transferencia', color: 'var(--ink-2)' },        account: { name: 'BBVA → Ahorro' }, amount: -500.00, status: 'match',  tag: { kind: 'ok', txt: 'Transferencia' } },
  { id: '8', occurred_at: '2026-04-21T11:20:00Z', description: 'Café El Jardín',          category: { name: 'Alimentación', color: 'var(--cat-food)' },     account: { name: 'Tarjeta Oro' },   amount: -6.80,   status: 'match',  tag: null },
  { id: '9', occurred_at: '2026-04-20T16:45:00Z', description: 'Hipoteca · BBVA',         category: { name: 'Vivienda',     color: 'var(--cat-housing)' },  account: { name: 'BBVA •• 4821' },  amount: -1420.00,status: 'match',  tag: { kind: 'ok', txt: 'Programado' } },
]

export function useTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('transactions')
        .select('*, account:accounts(name), category:categories(name, color)')
        .order('occurred_at', { ascending: false })
        .limit(100)

      if (error) {
        setError(error)
        setTransactions(MOCK)
      } else {
        setTransactions(data.length > 0 ? data : MOCK)
      }
      setLoading(false)
    }
    load()
  }, [])

  return { transactions, loading, error }
}
