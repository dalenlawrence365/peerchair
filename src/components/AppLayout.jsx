"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AppSidebar from "@/components/AppSidebar"
import { T, FONT_FAMILY } from "@/lib/pipelineTheme"

// AppLayout — used by every authenticated page in the new app.
// Auth gate (accepts 'ok' or '1' for legacy compatibility) + sidebar + content.

export default function AppLayout({ children }) {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(function(){
    if (typeof window === "undefined") return
    const v = localStorage.getItem("pc_auth")
    if (v === "ok" || v === "1") setAuthed(true)
    else router.replace("/")
    setChecked(true)
  }, [router])

  // Load Google Fonts once (cheap if already loaded)
  useEffect(function(){
    if (typeof document === "undefined") return
    if (document.getElementById("pc-pipeline-fonts")) return
    var preconnect1 = document.createElement("link"); preconnect1.rel = "preconnect"; preconnect1.href = "https://fonts.googleapis.com"; document.head.appendChild(preconnect1)
    var preconnect2 = document.createElement("link"); preconnect2.rel = "preconnect"; preconnect2.href = "https://fonts.gstatic.com"; preconnect2.crossOrigin = "anonymous"; document.head.appendChild(preconnect2)
    var link = document.createElement("link"); link.id = "pc-pipeline-fonts"; link.rel = "stylesheet"
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Instrument+Serif&display=swap"
    document.head.appendChild(link)
  }, [])

  if (!checked) return null
  if (!authed) return null

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: T.bg, fontFamily: FONT_FAMILY, color: T.textPrimary,
      fontSize: 14, lineHeight: 1.5, WebkitFontSmoothing: "antialiased",
    }}>
      <AppSidebar />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
