"use client"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { T, FONT_FAMILY } from "@/lib/pipelineTheme"
import SidebarSearch from "@/components/SidebarSearch"

export default function PoolLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(function(){
    if (typeof window === "undefined") return
    if (localStorage.getItem("pc_auth") === "1") setAuthed(true)
    else router.replace("/")
    setChecked(true)
  }, [router])

  if (!checked) return null
  if (!authed) return null

  function isActive(prefix) { return pathname && pathname.indexOf(prefix) === 0 }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT_FAMILY, background: T.bg, color: T.textPrimary }}>
      <aside style={{ width: 220, background: T.sidebarBg, color: T.sidebarText, padding: "20px 14px", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 16, padding: "0 8px", color: "white" }}>CFO Circle LA</div>
        <SidebarSearch />
        <SidebarLink href="/" label="Dashboard" />
        <SidebarLink href="/pipeline/cfo/pool" label="CFO Pipeline" active={isActive("/pipeline/cfo")} />
        <SidebarLink href="/pipeline/sponsor/pool" label="Sponsors" active={isActive("/pipeline/sponsor")} />
        <SidebarLink href="/pool/import" label="Import pool" active={pathname === "/pool/import"} />
        <SidebarLink href="/pool/export" label="Export for LinkedHelper" active={pathname === "/pool/export"} />
        <SidebarLink href="/queue/review" label="Review queue" active={pathname === "/queue/review"} />
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function SidebarLink({ href, label, active, count }) {
  return (
    <Link href={href} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 12px", fontSize: 13, fontWeight: active ? 600 : 400,
      color: active ? "white" : T.sidebarText, background: active ? T.sidebarActive : "transparent",
      borderRadius: 6, textDecoration: "none", marginBottom: 2
    }}>
      <span>{label}</span>
      {count !== undefined && <span style={{ fontSize: 11, color: T.sidebarText, opacity: 0.7 }}>{count}</span>}
    </Link>
  )
}
