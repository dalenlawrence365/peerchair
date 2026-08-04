"use client"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

function timeAgo(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago"
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago"
  const dd = Math.floor(h / 24); if (dd < 7) return dd + "d ago"
  return d.toLocaleDateString()
}

export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(function () {
    fetch("/api/notifications").then(function (r) { return r.json() }).then(function (d) {
      setItems((d && d.items) || [])
      setUnread((d && d.unread) || 0)
      setLoading(false)
    }).catch(function () { setLoading(false) })
  }, [])

  useEffect(function () { load() }, [load])

  function markRead(id) {
    setItems(function (prev) { return prev.map(function (n) { return n.id === id ? Object.assign({}, n, { is_read: true }) : n }) })
    setUnread(function (u) { return Math.max(0, u - 1) })
    fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) }).catch(function () {})
  }

  function markAll() {
    setItems(function (prev) { return prev.map(function (n) { return Object.assign({}, n, { is_read: true }) }) })
    setUnread(0)
    fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all" }) }).catch(function () {})
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.textPrimary, margin: 0 }}>
          Notifications{unread ? " · " + unread + " new" : ""}
        </h1>
        {unread ? (
          <button onClick={markAll} style={{
            background: T.cardBg, border: "1px solid " + T.border, color: T.textSecondary,
            fontSize: 13, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          }}>Mark all read</button>
        ) : null}
      </div>

      {loading ? (
        <div style={{ color: T.textTertiary }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ color: T.textTertiary, fontSize: 14 }}>
          Nothing yet. When someone opens your investment page, downloads the business case, or another signal fires, it shows up here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map(function (n) {
            const inner = (
              <div style={{
                display: "flex", gap: 12, alignItems: "flex-start",
                background: n.is_read ? T.cardBg : "#fffdf5",
                border: "1px solid " + (n.is_read ? T.border : "#f1e2b8"),
                borderRadius: 10, padding: "12px 14px",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, marginTop: 6, background: n.is_read ? "transparent" : "#d97706", flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                  {n.body ? <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.55, wordBreak: "break-word" }}>{n.body}</div> : null}
                  <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </div>
              </div>
            )
            const onClick = function () { if (!n.is_read) markRead(n.id) }
            return n.href
              ? <Link key={n.id} href={n.href} onClick={onClick} style={{ textDecoration: "none" }}>{inner}</Link>
              : <div key={n.id} onClick={onClick} style={{ cursor: "pointer" }}>{inner}</div>
          })}
        </div>
      )}
    </div>
  )
}
