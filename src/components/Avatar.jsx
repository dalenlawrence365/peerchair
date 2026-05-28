"use client"
import { useState } from "react"

// Avatar — shows a profile photo when we have one, else colored initials.
// Used everywhere people appear: profiles, fit call, search, lists, dashboard.

function initials(name) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic color from the name so the same person is always the same hue
function hueFor(name) {
  let h = 0
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export default function Avatar({ name, src, size = 40 }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = src && !failed
  const hue = hueFor(name)
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      background: showPhoto ? "transparent" : `hsl(${hue}, 55%, 42%)`,
      color: "white", fontWeight: 600, fontSize: Math.round(size * 0.38),
      lineHeight: 1, userSelect: "none",
    }}>
      {showPhoto
        ? <img src={src} alt={name || ""} width={size} height={size} onError={function(){ setFailed(true) }} style={{ width: size, height: size, objectFit: "cover" }} />
        : initials(name)}
    </div>
  )
}
