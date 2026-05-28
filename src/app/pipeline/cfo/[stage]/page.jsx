"use client"
import { useParams } from "next/navigation"
import PipelineView from "@/components/PipelineView"

const VALID_STAGES = ["pool", "audience", "prospect", "qualified", "member"]

export default function CfoStagePage() {
  const params = useParams()
  const stage = params && params.stage
  if (!VALID_STAGES.includes(stage)) {
    return <div style={{ padding: 40, color: "#dc2626" }}>Unknown stage: <strong>{String(stage)}</strong></div>
  }
  return <PipelineView type="cfo" stage={stage} />
}
