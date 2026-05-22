"use client"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"

const StageWorkspace = dynamic(() => import("@/components/StageWorkspace"), { ssr: false })

const VALID_STAGES = ["pool", "audience", "prospect", "qualified", "member"]

export default function StagePage() {
  var params = useParams()
  var stage = params && params.stage

  if (!VALID_STAGES.includes(stage)) {
    return (
      <div style={{ padding: 40, color: "#dc2626" }}>
        Unknown stage: <strong>{String(stage)}</strong>. Valid stages: {VALID_STAGES.join(", ")}
      </div>
    )
  }

  return <StageWorkspace stage={stage} />
}
