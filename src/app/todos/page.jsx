"use client"
import { useEffect, useState, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"
import { TodoQuickAdd, TodoRow } from "@/components/TodoList"

function todayISO() { return new Date().toISOString().slice(0, 10) }
function inDaysISO(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }

// Group an array of todos into the right buckets.
// Buckets follow the calendar week, not arbitrary day counts, so "in 7 days"
// from a Friday correctly lands in Next Week, not This Week.
function bucket(todos) {
  const today = todayISO()

  // End of current week = upcoming Sunday (inclusive)
  const now = new Date()
  const dow = now.getDay() // 0 = Sunday, 6 = Saturday
  const daysToSun = (7 - dow) % 7 // 0 if today is Sunday
  const endOfWeek = new Date(); endOfWeek.setDate(endOfWeek.getDate() + daysToSun)
  const endOfWeekStr = endOfWeek.toISOString().slice(0, 10)

  // End of next week = the Sunday after that (7 days later)
  const endOfNextWeek = new Date(endOfWeek); endOfNextWeek.setDate(endOfNextWeek.getDate() + 7)
  const endOfNextWeekStr = endOfNextWeek.toISOString().slice(0, 10)

  const out = { overdue: [], today: [], thisWeek: [], nextWeek: [], later: [], noDate: [], completed: [] }
  for (const t of todos) {
    if (t.completed_at)            { out.completed.push(t); continue }
    if (!t.scheduled_for)          { out.noDate.push(t); continue }
    if (t.scheduled_for < today)        { out.overdue.push(t); continue }
    if (t.scheduled_for === today)      { out.today.push(t); continue }
    if (t.scheduled_for <= endOfWeekStr)     { out.thisWeek.push(t); continue }
    if (t.scheduled_for <= endOfNextWeekStr) { out.nextWeek.push(t); continue }
    out.later.push(t)
  }
  const byDateAsc = (a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || "")
  out.overdue.sort(byDateAsc)
  out.today.sort(byDateAsc)
  out.thisWeek.sort(byDateAsc)
  out.nextWeek.sort(byDateAsc)
  out.later.sort(byDateAsc)
  return out
}

export default function TodosPage() {
  const [todos, setTodos] = useState([])
  const [completed, setCompleted] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  const reload = useCallback(async function(){
    setLoading(true)
    try {
      const [open, done] = await Promise.all([
        fetch("/api/todos?scope=open").then(r => r.json()),
        fetch("/api/todos?scope=completed").then(r => r.json()),
      ])
      if (open.error) setError(open.error); else setTodos(open.todos || [])
      if (!done.error) setCompleted(done.todos || [])
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  function onCreated(t)          { setTodos(prev => [...prev, t]) }
  function onComplete(id)        { reload() }
  function onUpdate(updated)     { setTodos(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x)) }
  function onDelete(id)          { setTodos(prev => prev.filter(x => x.id !== id)); setCompleted(prev => prev.filter(x => x.id !== id)) }

  const b = bucket(todos)
  const totalOpen = todos.length

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1000 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>To-dos</h1>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        {totalOpen.toLocaleString()} open · {b.today.length + b.overdue.length} due today or overdue
      </div>

      <TodoQuickAdd onCreated={onCreated} />

      {error && <div style={{ color: T.danger, marginBottom: 12 }}>⚠ {error}</div>}
      {loading && todos.length === 0 && <div style={{ color: T.textTertiary, fontSize: 13 }}>Loading…</div>}

      <Section label="Overdue" count={b.overdue.length} accent="#b91c1c">
        {b.overdue.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <Section label="Today" count={b.today.length} accent="#b45309">
        {b.today.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <Section label="This week" count={b.thisWeek.length}>
        {b.thisWeek.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <Section label="Next week" count={b.nextWeek.length}>
        {b.nextWeek.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <Section label="Later" count={b.later.length} defaultCollapsed>
        {b.later.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <Section label="No date" count={b.noDate.length} defaultCollapsed>
        {b.noDate.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
      </Section>

      <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid " + T.border }}>
        <button onClick={() => setShowCompleted(!showCompleted)}
          style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: T.textTertiary, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
          {showCompleted ? "▾" : "▸"} Completed · {completed.length}
        </button>
        {showCompleted && (
          <div style={{ marginTop: 10 }}>
            {completed.map(t => <TodoRow key={t.id} todo={t} onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        )}
      </div>
    </main>
  )
}

function Section({ label, count, accent, defaultCollapsed, children }) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed)
  if (count === 0 && defaultCollapsed) return null
  return (
    <section style={{ marginBottom: 22 }}>
      <button onClick={() => setCollapsed(!collapsed)}
        style={{ background: "none", border: "none", padding: 0, marginBottom: 8, fontSize: 13, fontWeight: 600, color: accent || T.textPrimary, cursor: "pointer", textAlign: "left", display: "block" }}>
        {collapsed ? "▸" : "▾"} {label} <span style={{ color: T.textTertiary, fontWeight: 400, marginLeft: 4 }}>· {count}</span>
      </button>
      {!collapsed && (count === 0 ?
        <div style={{ fontSize: 12, color: T.textTertiary, padding: "6px 12px" }}>Nothing here.</div>
        : children)}
    </section>
  )
}
