"use client"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"
import SidebarSearch from "@/components/SidebarSearch"

// AppSidebar — shared chrome used by every page in the new app.
// One nav, one place to add/remove links, one place to fix bugs.

const NAV = [
  // section, label, href, matchPrefix
  { section: "Workspace", items: [
    { label: "Dashboard",       href: "/dashboard",        matches: function(p){ return p === "/" || p === "/dashboard" } },
    { label: "CFO Pipeline",    href: "/pipeline/cfo/prospect", matches: function(p){ return p.startsWith("/pipeline/cfo") } },
    { label: "Sponsors",        href: "/pipeline/sponsor/pool", matches: function(p){ return p.startsWith("/pipeline/sponsor") } },
    { label: "Referral partners", href: "/referral",          matches: function(p){ return p.startsWith("/referral") } },
    { label: "LinkedIn",        href: "/linkedin-connections", matches: function(p){ return p.startsWith("/linkedin-connections") } },
  ] },
  { section: "Inbox", items: [
    { label: "Follow-up queue", href: "/inbox/follow-up",  matches: function(p){ return p === "/inbox/follow-up" } },
    { label: "LinkedIn replies", href: "/inbox/linkedin",  matches: function(p){ return p === "/inbox/linkedin" } },
    { label: "Unmatched",       href: "/inbox/unmatched",  matches: function(p){ return p === "/inbox/unmatched" } },
    { label: "Review queue",    href: "/queue/review",     matches: function(p){ return p === "/queue/review" } },
  ] },
  { section: "Schedule", items: [
    { label: "Meetings",        href: "/meetings",         matches: function(p){ return p.startsWith("/meetings") } },
  ] },
  { section: "Tools", items: [
    { label: "Data health",     href: "/health",           matches: function(p){ return p.startsWith("/health") } },
    { label: "Templates",       href: "/templates",        matches: function(p){ return p.startsWith("/templates") } },
    { label: "Assets",          href: "/assets",           matches: function(p){ return p.startsWith("/assets") } },
    { label: "Pool import",     href: "/pool/import",      matches: function(p){ return p === "/pool/import" } },
    { label: "Pool export",     href: "/pool/export",      matches: function(p){ return p === "/pool/export" } },
  ] },
]

export default function AppSidebar() {
  const pathname = usePathname() || ""

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: T.sidebarBg, color: T.sidebarText,
      display: "flex", flexDirection: "column",
      padding: "20px 14px",
      position: "sticky", top: 0, height: "100vh",
      overflowY: "auto",
    }}>
      {/* Logo / brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 6px 16px", marginBottom: 12, borderBottom: "1px solid " + (T.sidebarBorder || "rgba(255,255,255,0.08)") }}>
        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #3b82f6, #1e40af)", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontFamily: FONT_SERIF, fontSize: 16, fontStyle: "italic" }}>C</div>
        <div>
          <div style={{ fontFamily: FONT_SERIF, fontSize: 16, color: "white", lineHeight: 1 }}>CFO Circle</div>
          <div style={{ fontSize: 10, color: T.sidebarMuted || "rgba(255,255,255,0.5)", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 2 }}>Los Angeles</div>
        </div>
      </div>

      <SidebarSearch />

      <nav style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map(function(section){
          return (
            <div key={section.section} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel || "rgba(255,255,255,0.4)", padding: "0 8px 6px", fontWeight: 500 }}>{section.section}</div>
              {section.items.map(function(item){
                const active = item.matches(pathname)
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: "block",
                    padding: "7px 10px",
                    color: active ? "white" : (T.sidebarText || "rgba(255,255,255,0.7)"),
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: "none",
                    background: active ? (T.sidebarActiveBg || "rgba(255,255,255,0.08)") : "transparent",
                    fontWeight: active ? 500 : 400,
                    marginBottom: 1,
                  }}>{item.label}</Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User chip */}
      <div style={{ marginTop: "auto", padding: 10, background: T.sidebarActiveBg || "rgba(255,255,255,0.06)", borderRadius: 8, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 600, fontSize: 12 }}>DL</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>Dalen Lawrence</div>
          <div style={{ color: T.sidebarMuted || "rgba(255,255,255,0.5)", fontSize: 10 }}>Chapter Director</div>
        </div>
      </div>
    </aside>
  )
}
