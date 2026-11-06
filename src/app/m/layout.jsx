"use client"
import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { T, FONT_FAMILY } from "@/lib/pipelineTheme"

/* Mobile surface shell — deliberately does NOT use AppLayout/AppSidebar (that's a
   desktop flex row). Full-width single column, bottom tab bar for thumbs, same
   pc_auth gate as the desktop app. Only place in the app with real CSS classes +
   one media query: everything else is inline-styled and can't take breakpoints. */

const TABS = [
  { href: "/m/admit", label: "Admit", icon: "M5 13l4 4L19 7" },
  { href: "/m/people", label: "People", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1" },
]

export default function MobileLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(function () {
    if (typeof window === "undefined") return
    const v = localStorage.getItem("pc_auth")
    if (v === "ok" || v === "1") setAuthed(true)
    else router.replace("/")
    setChecked(true)
  }, [router])

  useEffect(function () {
    if (typeof document === "undefined") return
    if (document.getElementById("pc-pipeline-fonts")) return
    var l = document.createElement("link"); l.id = "pc-pipeline-fonts"; l.rel = "stylesheet"
    l.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Instrument+Serif&display=swap"
    document.head.appendChild(l)
  }, [])

  if (!checked || !authed) return null

  return (
    <div className="m-root" style={{ fontFamily: FONT_FAMILY, color: T.textPrimary }}>
      <style>{`
        html, body { background: ${T.bg} !important; }
        .m-root { min-height: 100vh; background: ${T.bg}; max-width: 560px; margin: 0 auto;
          display: flex; flex-direction: column; -webkit-font-smoothing: antialiased; }
        .m-content { flex: 1; padding: 14px 14px 88px; }
        .m-tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
          display: flex; max-width: 560px; margin: 0 auto;
          background: ${T.cardBg}; border-top: 1px solid ${T.border};
          padding-bottom: env(safe-area-inset-bottom, 0); }
        .m-tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
          padding: 10px 0 12px; font-size: 11px; font-weight: 600; text-decoration: none;
          color: ${T.textTertiary}; background: none; border: 0; cursor: pointer; }
        .m-tab[data-active="true"] { color: ${T.accent}; }
        .m-card { background: ${T.cardBg}; border: 1px solid ${T.border}; border-radius: 14px; }
        .m-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-height: 46px; padding: 0 16px; border-radius: 11px; font-size: 15px; font-weight: 600;
          border: 1px solid ${T.border}; background: ${T.cardBg}; color: ${T.textPrimary};
          cursor: pointer; width: 100%; -webkit-tap-highlight-color: transparent; }
        .m-btn-primary { background: ${T.accent}; border-color: ${T.accent}; color: #fff; }
        .m-btn-danger { background: #fff; border-color: #f0c0c0; color: #b42318; }
        .m-btn:disabled { opacity: .55; }
        .m-input { width: 100%; min-height: 46px; padding: 0 14px; border-radius: 11px; font-size: 16px;
          border: 1px solid ${T.border}; background: ${T.cardBg}; color: ${T.textPrimary}; outline: none; }
        .m-input:focus { border-color: ${T.accent}; }
        textarea.m-input { padding: 12px 14px; line-height: 1.5; resize: vertical; }
      `}</style>

      <div className="m-content">{children}</div>

      <nav className="m-tabbar">
        {TABS.map(function (t) {
          var active = pathname === t.href || pathname.indexOf(t.href + "/") === 0
          return (
            <a key={t.href} href={t.href} className="m-tab" data-active={active ? "true" : "false"}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {t.label}
            </a>
          )
        })}
      </nav>
    </div>
  )
}
