"use client"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import dynamic from "next/dynamic"

const StageWorkspace = dynamic(() => import("@/components/StageWorkspace"), { ssr: false })

const KEY = "pc_auth"
const VALID_STAGES = ["pool", "audience", "prospect", "qualified", "member"]

export default function StagePage() {
  var params = useParams()
  var router = useRouter()
  var [auth, setAuth] = useState(false)
  var [checking, setChecking] = useState(true)

  var stage = params && params.stage

  useEffect(function() {
    if (typeof window !== "undefined") {
      if (localStorage.getItem(KEY) === "ok") setAuth(true)
      else router.replace("/")
    }
    setChecking(false)
  }, [router])

  if (checking) return null
  if (!auth) return null
  if (!VALID_STAGES.includes(stage)) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif", color: "#dc2626" }}>
        Unknown stage: <strong>{String(stage)}</strong>. Valid stages: {VALID_STAGES.join(", ")}
      </div>
    )
  }

  return <StageWorkspace stage={stage} />
}
