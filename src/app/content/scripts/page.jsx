"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { T } from "@/lib/pipelineTheme"

// The Scripts board is retired — writing a script and creating its post used to
// be two separate steps in two separate tables, which is exactly what stopped
// working. Now a script is just the "Script" field on a post (Start a post),
// and production stage lives on the post's own Status. Redirect so an old
// bookmark doesn't quietly resurrect the split workflow.
export default function ScriptsPageRedirect() {
  const router = useRouter()
  useEffect(function () { router.replace("/content") }, [])
  return (
    <main style={{ padding: "26px 32px 80px", maxWidth: 700 }}>
      <div style={{ color: T.textTertiary, fontSize: 13.5, lineHeight: 1.6 }}>
        The Script library has moved — a script is now just part of the post it belongs to.
        Taking you to <Link href="/content" style={{ color: T.accent }}>Content</Link>…
      </div>
    </main>
  )
}
