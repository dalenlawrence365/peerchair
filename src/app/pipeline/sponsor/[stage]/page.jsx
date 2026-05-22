"use client"
import { useParams } from "next/navigation"
import dynamic from "next/dynamic"

const SponsorStageWorkspace = dynamic(() => import("@/components/SponsorStageWorkspace"), { ssr: false })

const VALID_STAGES = ["pool", "audience", "discovery", "proposal", "active"]

export default function SponsorStagePage() {
  var params = useParams()
  var stage = params && params.stage

  if (!VALID_STAGES.includes(stage)) {
    return (
      <div style={{ padding: 40, color: "#dc2626" }}>
        Unknown stage: <strong>{String(stage)}</strong>. Valid stages: {VALID_STAGES.join(", ")}
      </div>
    )
  }

  return <SponsorStageWorkspace stage={stage} />
}
