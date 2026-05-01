import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Dashboard from '../screens/Dashboard'
import Transactions from '../screens/Transactions'
import Budgets from '../screens/Budgets'
import Reconciliation from '../screens/Reconciliation'
import CalendarScreen from '../screens/Calendar'
import ReviewShared from '../screens/Review'
import AccountsScreen from '../screens/Accounts'
import CategoriesScreen from '../screens/Categories'

const ACCENTS = {
  indigo:  { a: '#6366f1', b: '#a855f7', c: '#ec4899' },
  emerald: { a: '#10b981', b: '#06b6d4', c: '#84cc16' },
  amber:   { a: '#f97316', b: '#eab308', c: '#ef4444' },
  cyan:    { a: '#0ea5e9', b: '#6366f1', c: '#a855f7' },
}

function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.indigo
  document.documentElement.style.setProperty('--accent', a.a)
  document.documentElement.style.setProperty('--accent-2', a.b)
  document.documentElement.style.setProperty('--accent-3', a.c)
}

export default function Shell() {
  const [accent] = useState('indigo')
  useEffect(() => applyAccent(accent), [accent])

  return (
    <div className="app">
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/expenses"   element={<Transactions type="expense" />} />
            <Route path="/income"     element={<Transactions type="income" />} />
            <Route path="/budgets"    element={<Budgets />} />
            <Route path="/calendar"   element={<CalendarScreen />} />
            <Route path="/review"     element={<ReviewShared />} />
            <Route path="/reports"    element={<Reconciliation />} />
            <Route path="/recurring"  element={<Reconciliation />} />
            <Route path="/accounts"    element={<AccountsScreen />} />
            <Route path="/categories"  element={<CategoriesScreen />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
