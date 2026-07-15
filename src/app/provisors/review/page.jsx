"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

const GROUP_LABEL = {
  "Middle Market Affinity Group": "Middle Market",
  "M$A/Capital Formation Group": "M&A Capital",
  "Transactions & Transitions": "T&T",
  "Valley Distributors & Manufacturers": "Valley D&M",
  "Mergers & Acquisitions 2": "M&A 2",
}
const gl = (g) => GROUP_LABEL[g] || g

function Pill({ bg, fg, text }) {
  return <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 999, fontSize: 9.5, fontWeight: 600, background: bg, color: fg, whiteSpace: "nowrap" }}>{text}</span>
}
function fmtRel(iso) {
  if (!iso) return "—"
  const days = (Date.now() - new Date(iso)) / 86400000
  if (days < 1) return "today"
  if (days < 30) return Math.round(days) + "d ago"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function ChangeLine({ c }) {
  if (c.addGroups) {
    return <div style={{ fontSize: 11.5, color: "#0891b2" }}>+ {c.addGroups.length} group{c.addGroups.length > 1 ? "s" : ""}: {c.addGroups.map(gl).join(", ")}</div>
  }
  return (
    <div style={{ fontSize: 11.5, color: T.textSecondary }}>
      <span style={{ color: T.textTertiary }}>{c.field}: </span>
      {c.fill
        ? <><span style={{ color: T.textTertiary, fontStyle: "italic" }}>set </span><span style={{ fontWeight: 500 }}>{c.to}</span></>
        : <><span style={{ textDecoration: "line-through", color: T.textTertiary }}>{c.from || "—"}</span><span style={{ color: T.textTertiary }}> → </span><span style={{ fontWeight: 600, color: "#b45309" }}>{c.to}</span></>}
    </div>
  )
}

export default function ReviewQueue() {
  const [batches, setBatches] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [detail, setDetail] = useState({})          // batch_id -> {summary, people}
  const [loadingDetail, setLoadingDetail] = useState({})
  const [busy, setBusy] = useState(null)
  const [receipts, setReceipts] = useState({})
  // batch_id -> Set of row indices to import. Approve used to be all-or-nothing,
  // so one bad row held the whole roster hostage.
  const [picked, setPicked] = useState({})

  async function load() {
    try {
      const r = await fetch("/api/provisors/review?status=pending")
      const d = await r.json()
      if (d.error) setError(d.error); else setBatches(d.batches || [])
    } catch (e) { setError(String(e)) }
  }
  useEffect(() => { load() }, [])

  async function toggle(id) {
    const open = !expanded[id]
    setExpanded(e => ({ ...e, [id]: open }))
    if (open && !detail[id]) {
      setLoadingDetail(l => ({ ...l, [id]: true }))
      try {
        const r = await fetch(`/api/provisors/review/${id}`)
        const d = await r.json()
        if (!d.error) {
          setDetail(p => ({ ...p, [id]: d }))
          // Default: import everyone except Dalen himself.
          const def = new Set((d.people || [])
            .filter(x => x._status !== "self")
            .map(x => x._index))
          setPicked(p => ({ ...p, [id]: def }))
        }
      } catch (e) { /* leave undefined; UI shows load failure */ }
      setLoadingDetail(l => ({ ...l, [id]: false }))
    }
  }

  function togglePick(batchId, index) {
    setPicked(function (prev) {
      const cur = new Set(prev[batchId] || [])
      if (cur.has(index)) cur.delete(index); else cur.add(index)
      return { ...prev, [batchId]: cur }
    })
  }
  function pickAll(batchId, on) {
    const d = detail[batchId]
    if (!d) return
    const next = on
      ? new Set((d.people || []).filter(x => x._status !== "self").map(x => x._index))
      : new Set()
    setPicked(function (prev) { return { ...prev, [batchId]: next } })
  }

  async function act(batch_id, action) {
    setBusy(batch_id)
    try {
      const sel = picked[batch_id]
      const payload = { batch_id, action }
      // Only constrain the import if the batch has been opened and reviewed.
      if (action === "approve" && sel) payload.selected = Array.from(sel)
      const r = await fetch("/api/provisors/review", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (d.error) { setReceipts(p => ({ ...p, [batch_id]: { error: d.error } })) }
      else {
        setReceipts(p => ({ ...p, [batch_id]: d }))
        setBatches(b => (b || []).filter(x => x.id !== batch_id))
      }
    } catch (e) { setReceipts(p => ({ ...p, [batch_id]: { error: String(e) } })) }
    setBusy(null)
  }

  if (error) return <main style={{ padding: 32 }}><div style={{ color: T.danger }}>⚠ {error}</div></main>
  if (!batches) return <main style={{ padding: 32 }}><div style={{ color: T.textTertiary }}>Loading…</div></main>

  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Review Queue</h1>
        <Link href="/provisors" style={{ fontSize: 12, color: T.textTertiary, textDecoration: "none" }}>← ProVisors</Link>
      </div>
      <div style={{ fontSize: 13, color: T.textTertiary, marginTop: 4, marginBottom: 22 }}>
        Parsed ProVisors rosters waiting for your approval. Open one to see the new people and exactly what will change on existing profiles before you approve.
      </div>

      {batches.length === 0 && (
        <div style={{ padding: 32, color: T.textTertiary, fontSize: 13, textAlign: "center", background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12 }}>
          Nothing waiting. New rosters appear here automatically.
        </div>
      )}

      {batches.map(b => {
        const sum = b.summary || {}
        const isOpen = !!expanded[b.id]
        const det = detail[b.id]
        const rcpt = receipts[b.id]
        const people = det ? det.people : []
        const newPeople = people.filter(p => p._status === "new")
        const existPeople = people.filter(p => p._status === "existing")
        const dsum = det ? det.summary : null
        return (
          <div key={b.id} style={{ background: T.cardBg, border: "1px solid " + T.border, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid " + T.border, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{b.meeting_group || "ProVisors roster"}</div>
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>
                  {b.filename ? b.filename + " · " : ""}{b.source} · {fmtRel(b.created_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Pill bg="rgba(0,0,0,0.05)" fg={T.textSecondary} text={`${sum.total ?? 0} on roster`} />
                <Pill bg="rgba(22,163,74,0.14)" fg="#15803d" text={`${sum.new ?? 0} new`} />
                <Pill bg="rgba(8,145,178,0.12)" fg="#0891b2" text={`${sum.existing ?? 0} existing`} />
              </div>
            </div>

            {rcpt && (
              <div style={{ padding: "10px 16px", fontSize: 12, background: rcpt.error ? "rgba(220,38,38,0.06)" : "rgba(22,163,74,0.06)", color: rcpt.error ? T.danger : "#15803d", borderBottom: "1px solid " + T.border }}>
                {rcpt.error ? `⚠ ${rcpt.error}` : `✓ Added ${rcpt.created_count}, updated ${rcpt.updated_count}${rcpt.skipped_count ? `, skipped ${rcpt.skipped_count}` : ""}${rcpt.excluded_count ? ` · ${rcpt.excluded_count} left out by you` : ""}.`}
              </div>
            )}

            {isOpen && (
              <div style={{ borderBottom: "1px solid " + T.border }}>
                {loadingDetail[b.id] && <div style={{ padding: "12px 16px", fontSize: 12, color: T.textTertiary }}>Loading detail…</div>}
                {!loadingDetail[b.id] && !det && <div style={{ padding: "12px 16px", fontSize: 12, color: T.danger }}>Couldn't load detail.</div>}
                {det && (() => {
                  const selfPeople = (det.people || []).filter(x => x._status === "self")
                  const sel = picked[b.id] || new Set()
                  const selectable = (det.people || []).filter(x => x._status !== "self").length
                  return (
                  <div style={{ maxHeight: 460, overflow: "auto" }}>
                    {selfPeople.length > 0 && (
                      <div style={{ padding: "10px 16px", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid " + T.border, fontSize: 12.5, color: "#92400e" }}>
                        <strong>You're on this roster</strong> — {selfPeople.map(x => x.full_name).join(", ")} ({selfPeople.map(x => x.email).filter(Boolean).join(", ")}).
                        Excluded and not selectable; a roster can't create or rewrite your own record.
                      </div>
                    )}

                    <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid " + T.border, position: "sticky", top: 0, background: "white", zIndex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary }}>
                        {sel.size} of {selectable} selected
                      </span>
                      <button onClick={() => pickAll(b.id, true)}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                        Select all
                      </button>
                      <button onClick={() => pickAll(b.id, false)}
                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                        Select none
                      </button>
                      <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: "auto" }}>
                        Only ticked rows are imported.
                      </span>
                    </div>

                    {/* NEW people — the ones actually being added */}
                    {newPeople.length > 0 && (
                      <div style={{ padding: "10px 16px 4px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: "#15803d", textTransform: "uppercase" }}>
                        New — will be created ({newPeople.length})
                      </div>
                    )}
                    {newPeople.map((p, i) => (
                      <div key={"n" + i} style={{ padding: "8px 16px", background: sel.has(p._index) ? "rgba(22,163,74,0.05)" : "transparent", opacity: sel.has(p._index) ? 1 : 0.5, borderBottom: "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"), fontSize: 12.5, display: "flex", gap: 9, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={sel.has(p._index)} onChange={() => togglePick(b.id, p._index)} style={{ marginTop: 2, cursor: "pointer" }} />
                        <span>
                        <span style={{ fontWeight: 600 }}>{p.full_name}</span>
                        {p.title && <span style={{ color: T.textTertiary }}> · {p.title}</span>}
                        {p.company && <span style={{ color: T.textTertiary }}> · {p.company}</span>}
                        {p.email && <span style={{ color: T.textTertiary }}> · {p.email}</span>}
                        {(p.groups || []).length > 0 && (
                          <span style={{ marginLeft: 6, display: "inline-flex", gap: 4 }}>
                            {p.groups.map((g, gi) => <Pill key={gi} bg="rgba(8,145,178,0.10)" fg="#0891b2" text={gl(g)} />)}
                          </span>
                        )}
                        </span>
                      </div>
                    ))}

                    {/* EXISTING people — only the ones that actually change; the rest collapse to a single count */}
                    {(() => {
                      const changedPeople = existPeople.filter(p => (p._changes || []).length > 0)
                      const unchangedCount = dsum ? dsum.unchanged : (existPeople.length - changedPeople.length)
                      return (
                        <>
                          {changedPeople.length > 0 && (
                            <div style={{ padding: "10px 16px 4px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: "#0891b2", textTransform: "uppercase" }}>
                              Updates ({changedPeople.length})
                            </div>
                          )}
                          {changedPeople.map((p, i) => (
                            <div key={"e" + i} style={{ padding: "8px 16px", opacity: sel.has(p._index) ? 1 : 0.5, borderBottom: i === changedPeople.length - 1 ? "none" : "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)"), fontSize: 12.5, display: "flex", gap: 9, alignItems: "flex-start" }}>
                              <input type="checkbox" checked={sel.has(p._index)} onChange={() => togglePick(b.id, p._index)} style={{ marginTop: 2, cursor: "pointer" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                              <div>
                                <span style={{ fontWeight: 500 }}>{p.full_name}</span>
                                {p.company && <span style={{ color: T.textTertiary }}> · {p.company}</span>}
                              </div>
                              <div style={{ marginTop: 3, marginLeft: 10, display: "flex", flexDirection: "column", gap: 1 }}>
                                {(p._changes || []).map((c, ci) => <ChangeLine key={ci} c={c} />)}
                              </div>
                              </div>
                            </div>
                          ))}
                          {unchangedCount > 0 && (
                            <div style={{ padding: "10px 16px", fontSize: 12, color: T.textTertiary, borderTop: changedPeople.length > 0 ? "1px solid " + (T.borderSoft || "rgba(0,0,0,0.05)") : "none" }}>
                              ✓ {unchangedCount} already current — no changes
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                  )
                })()}
              </div>
            )}

            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => toggle(b.id)}
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textSecondary, cursor: "pointer", fontFamily: "inherit" }}>
                {isOpen ? "Hide" : "Review"} {sum.total ?? ""} people
              </button>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button disabled={busy === b.id} onClick={() => act(b.id, "dismiss")}
                  style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + T.border, background: "white", color: T.textTertiary, cursor: "pointer", fontFamily: "inherit", opacity: busy === b.id ? 0.5 : 1 }}>
                  Dismiss
                </button>
                <button disabled={busy === b.id} onClick={() => act(b.id, "approve")}
                  style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "none", background: "#15803d", color: "white", cursor: "pointer", fontFamily: "inherit", opacity: busy === b.id ? 0.5 : 1 }}>
                  {busy === b.id ? "Working…" : (picked[b.id] ? `Import ${picked[b.id].size} selected` : "Approve")}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </main>
  )
}
