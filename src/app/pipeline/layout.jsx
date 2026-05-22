"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { T, FONT_FAMILY, FONT_SERIF } from "@/lib/pipelineTheme"

const KEY = "pc_auth"

export default function PipelineLayout({ children }) {
  var pathname = usePathname()
  var router = useRouter()
  var [auth, setAuth] = useState(false)
  var [checking, setChecking] = useState(true)

  // Auth check — runs once on mount, NOT on navigation between siblings
  useEffect(function() {
    if (typeof window !== "undefined") {
      if (localStorage.getItem(KEY) === "ok") setAuth(true)
      else router.replace("/")
    }
    setChecking(false)
  }, [router])

  // Load Google Fonts once for the whole pipeline subtree
  useEffect(function() {
    if (typeof document === "undefined") return
    if (document.getElementById("pc-pipeline-fonts")) return
    var preconnect1 = document.createElement("link")
    preconnect1.rel = "preconnect"
    preconnect1.href = "https://fonts.googleapis.com"
    document.head.appendChild(preconnect1)

    var preconnect2 = document.createElement("link")
    preconnect2.rel = "preconnect"
    preconnect2.href = "https://fonts.gstatic.com"
    preconnect2.crossOrigin = "anonymous"
    document.head.appendChild(preconnect2)

    var link = document.createElement("link")
    link.id = "pc-pipeline-fonts"
    link.rel = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Instrument+Serif&display=swap"
    document.head.appendChild(link)
  }, [])

  if (checking) return null
  if (!auth) return null

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      background: T.bg,
      fontFamily: FONT_FAMILY,
      color: T.textPrimary,
      fontSize: 14,
      lineHeight: 1.5,
      WebkitFontSmoothing: "antialiased",
    }}>
      <Sidebar pathname={pathname} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ pathname }) {
  function isActive(prefix) {
    return pathname === prefix || (pathname && pathname.startsWith(prefix + "/"))
  }

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: T.sidebarBg, color: T.sidebarText,
      display: "flex", flexDirection: "column",
      padding: "24px 16px",
      position: "sticky", top: 0, height: "100vh",
      overflowY: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 24px", marginBottom: 16, borderBottom: "1px solid " + T.sidebarBorder }}>
        <div style={{ width: 36, height: 36, background: "linear-gradient(135deg, #3b82f6, #1e40af)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: FONT_SERIF, fontSize: 18, fontStyle: "italic" }}>C</div>
        <div>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 18, color: "white", lineHeight: 1 }}>CFO Circle</div>
          <div style={{ fontSize: 11, color: T.sidebarMuted, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 2 }}>Los Angeles</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel, padding: "0 8px 8px", fontWeight: 500 }}>Workspace</div>
        <SidebarLink href="/" label="Dashboard" />
        <SidebarLink href="/pipeline/cfo/prospect" label="Pipeline" count="55" active={isActive("/pipeline")} />
        <SidebarLink href="/" label="Sponsors" count="119" />
        <SidebarLink href="/" label="Events" />
        <SidebarLink href="/" label="Today" />
        <SidebarLink href="/" label="Find a person" />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel, padding: "0 8px 8px", fontWeight: 500 }}>Settings</div>
        <SidebarLink href="/" label="Reports" />
        <SidebarLink href="/" label="Settings" />
      </div>

      <div style={{ marginTop: "auto", padding: 12, background: T.sidebarActiveBg, borderRadius: 10, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: 999, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 14 }}>DL</div>
        <div>
          <div style={{ color: "white", fontSize: 13, fontWeight: 500 }}>Dalen Lawrence</div>
          <div style={{ color: T.sidebarMuted, fontSize: 11 }}>Chapter Director</div>
        </div>
      </div>
    </aside>
  )
}

function SidebarLink({ href, label, count, active }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "9px 10px",
      color: active ? T.sidebarActive : T.sidebarText,
      borderRadius: 7,
      fontSize: 14,
      textDecoration: "none",
      background: active ? T.sidebarActiveBg : "transparent",
      fontWeight: active ? 500 : 400,
      marginBottom: 1,
    }}>
      {label}
      {count && <span style={{
        marginLeft: "auto", fontSize: 11,
        background: active ? T.accent : T.sidebarBorder,
        color: active ? "white" : T.sidebarText,
        padding: "1px 7px", borderRadius: 999, fontWeight: 500,
      }}>{count}</span>}
    </Link>
  )
}
