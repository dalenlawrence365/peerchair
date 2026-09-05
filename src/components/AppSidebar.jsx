"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { T, FONT_SERIF } from "@/lib/pipelineTheme"
import SidebarSearch from "@/components/SidebarSearch"

// AppSidebar — shared chrome used by every page in the new app.
// One nav, one place to add/remove links, one place to fix bugs.

const NAV = [
  // section, label, href, matchPrefix
  { section: "Workspace", items: [
    { label: "Notifications",   href: "/notifications",         matches: function(p){ return p.startsWith("/notifications") } },
    { label: "Dashboard",       href: "/dashboard",        matches: function(p){ return p === "/" || p === "/dashboard" } },
    { label: "CFO Pipeline",    href: "/pipeline/cfo/prospect", matches: function(p){ return p.startsWith("/pipeline/cfo") } },
    { label: "CFO outreach",    href: "/cfo-metrics",           matches: function(p){ return p.startsWith("/cfo-metrics") } },
    { label: "Site traffic",    href: "/traffic",               matches: function(p){ return p.startsWith("/traffic") } },
    { label: "Events",          href: "/events",                matches: function(p){ return p.startsWith("/events") } },
    { label: "Content",        href: "/content",               matches: function(p){ return p.startsWith("/content") } },
    { label: "Unmatched",       href: "/unmatched",             matches: function(p){ return p.startsWith("/unmatched") } },
    { label: "Sponsors",        href: "/pipeline/sponsor/pool", matches: function(p){ return p.startsWith("/pipeline/sponsor") } },
    { label: "ProVisors",       href: "/provisors",             matches: function(p){ return p.startsWith("/provisors") } },
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
    { label: "To-dos",          href: "/todos",            matches: function(p){ return p.startsWith("/todos") } },
    { label: "Meetings",        href: "/meetings",         matches: function(p){ return p.startsWith("/meetings") } },
  ] },
  { section: "Tools", items: [
    { label: "Data health",     href: "/health",           matches: function(p){ return p.startsWith("/health") } },
    { label: "Templates",       href: "/templates",        matches: function(p){ return p.startsWith("/templates") } },
    { label: "Links",           href: "/links",            matches: function(p){ return p.startsWith("/links") } },
    { label: "Assets",          href: "/assets",           matches: function(p){ return p.startsWith("/assets") } },
    { label: "Pool import",     href: "/pool/import",      matches: function(p){ return p === "/pool/import" } },
    { label: "Pool export",     href: "/pool/export",      matches: function(p){ return p === "/pool/export" } },
  ] },
]

export default function AppSidebar() {
  const pathname = usePathname() || ""
  const [unread, setUnread] = useState(0)
  const [eventsPending, setEventsPending] = useState(0)

  // Poll the unread notification count for the badge.
  useEffect(function(){
    var alive = true
    function load(){
      fetch("/api/notifications").then(function(r){ return r.json() }).then(function(d){
        if (alive) { setUnread((d && d.unread) || 0); setEventsPending((d && d.events_pending) || 0) }
      }).catch(function(){})
    }
    load()
    var iv = setInterval(load, 45000)
    return function(){ alive = false; clearInterval(iv) }
  }, [])

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
      <div style={{ padding: "6px 6px 18px", marginBottom: 12, borderBottom: "1px solid " + (T.sidebarBorder || "rgba(255,255,255,0.08)") }}>
        <img src="/cfo-circle-la-logo.png" alt="CFO Circle — Los Angeles" style={{ width: "100%", maxWidth: 200, height: "auto", display: "block" }} />
      </div>

      <SidebarSearch />

      <nav style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map(function(section){
          return (
            <div key={section.section} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: T.sidebarSectionLabel || "rgba(255,255,255,0.4)", padding: "0 8px 6px", fontWeight: 500 }}>{section.section}</div>
              {section.items.map(function(item){
                const active = item.matches(pathname)
                const badgeCount = item.href === "/notifications" ? unread : (item.href === "/events" ? eventsPending : 0)
                const showBadge = badgeCount > 0
                return (
                  <Link key={item.href} href={item.href} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "7px 10px",
                    color: active ? "white" : (T.sidebarText || "rgba(255,255,255,0.7)"),
                    borderRadius: 6,
                    fontSize: 13,
                    textDecoration: "none",
                    background: active ? (T.sidebarActiveBg || "rgba(255,255,255,0.08)") : "transparent",
                    fontWeight: active ? 500 : 400,
                    marginBottom: 1,
                  }}>
                    <span>{item.label}</span>
                    {showBadge ? (
                      <span style={{
                        background: "#dc2626", color: "white", fontSize: 11, fontWeight: 600,
                        minWidth: 18, height: 18, borderRadius: 999, padding: "0 5px",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                      }}>{badgeCount > 99 ? "99+" : badgeCount}</span>
                    ) : null}
                  </Link>
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
