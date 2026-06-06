"use client"
import { useEffect, useState, useCallback } from "react"
import { T } from "@/lib/pipelineTheme"
import { TodoQuickAdd, TodoRow } from "@/components/TodoList"

// Embeddable to-do card for /people/[id] and /companies/[id].
// Shows open + recently-completed todos scoped to one record.
// Hides the person/company link in each row (it's already implied by context).
export default function ProfileTodoCard({ personId, companyId, defaultName }) {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  const param = personId ? `person_id=${personId}` : `company_id=${companyId}`

  const reload = useCallback(async function(){
    setLoading(true)
    try {
      const r = await fetch(`/api/todos?scope=all&${param}`)
      const d = await r.json()
      setTodos(d.todos || [])
    } finally { setLoading(false) }
  }, [param])

  useEffect(() => { reload() }, [reload])

  function onCreated(t)      { setTodos(prev => [...prev, t]) }
  function onComplete(id)    { reload() }
  function onUpdate(updated) { setTodos(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x)) }
  function onDelete(id)      { setTodos(prev => prev.filter(x => x.id !== id)) }

  const open = todos.filter(t => !t.completed_at).sort((a, b) => (a.scheduled_for || "9999").localeCompare(b.scheduled_for || "9999"))
  const done = todos.filter(t =>  t.completed_at).sort((a, b) => b.completed_at.localeCompare(a.completed_at))

  return (
    <div style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          To-dos {open.length > 0 && <span style={{ color: T.textPrimary, marginLeft: 4 }}>· {open.length} open</span>}
        </div>
      </div>

      <TodoQuickAdd personId={personId} companyId={companyId} defaultPersonName={defaultName} onCreated={onCreated} />

      {loading && todos.length === 0 && <div style={{ color: T.textTertiary, fontSize: 12 }}>Loading…</div>}

      {open.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: T.textTertiary, padding: "8px 12px" }}>
          No open todos. Use a preset above to add one.
        </div>
      )}

      {open.map(t => (
        <TodoRow key={t.id} todo={t}
          onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete}
          showPersonLink={false} showCompanyLink={false} />
      ))}

      {done.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + T.border }}>
          <button onClick={() => setShowCompleted(!showCompleted)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: T.textTertiary, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
            {showCompleted ? "▾" : "▸"} Completed · {done.length}
          </button>
          {showCompleted && (
            <div style={{ marginTop: 8 }}>
              {done.map(t => (
                <TodoRow key={t.id} todo={t}
                  onComplete={onComplete} onUpdate={onUpdate} onDelete={onDelete}
                  showPersonLink={false} showCompanyLink={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
