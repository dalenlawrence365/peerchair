"use client"
import { useState } from "react"

export default function CopyPromptButton({ data, comms }) {
  var [copied, setCopied] = useState(false)

  function buildPrompt() {
    var commsText = (comms || []).slice(0, 10).reverse().map(function(m) {
      var dir = (m.direction === "OUT" || m.direction === "outbound") ? "Dalen" : (data.firstName || "Contact")
      var dt = m.occurred_at ? new Date(m.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""
      return "[" + dt + " " + dir + "]: " + (m.body || m.step_label || "").slice(0, 400)
    }).join("\n")

    var lines = [
      "CONTACT",
      (data.firstName || "") + " " + (data.lastName || "") + " | " + (data.title || "") + " | " + (data.company || ""),
      "Email: " + (data.email || "not on file"),
      "Stage: " + (data.pipelineStage || "unknown"),
      "",
      "ABOUT DALEN",
      "Dalen Lawrence, Chapter Director, CFO Circle Los Angeles",
      "CFO Circle is a confidential monthly peer advisory group for CFOs of privately held $20M-$500M revenue companies.",
      "Dalen email: dalen.lawrence@cfo-circle.com",
      "Sponsor discovery call: https://calendly.com/cfocirclela/cfo-circle-sponsor-discovery-call",
      "CFO fit call: https://calendly.com/cfocirclela/cfo-circle-fit-chat",
    ]

    if (commsText) {
      lines.push("")
      lines.push("COMMUNICATION HISTORY")
      lines.push(commsText)
    }

    lines.push("")
    lines.push("TASK")
    lines.push("Write a short, direct, peer-to-peer email from Dalen to " + (data.firstName || "this contact") + ". Reference the history above. No fluff, no generic openers.")

    return lines.join("\n")
  }

  function copy() {
    var prompt = buildPrompt()
    navigator.clipboard.writeText(prompt).then(function() {
      setCopied(true)
      setTimeout(function() { setCopied(false) }, 2000)
    })
  }

  return (
    <button
      onClick={copy}
      style={{
        padding: "5px 14px",
        background: copied ? "rgba(46,204,113,0.1)" : "rgba(240,200,74,0.1)",
        border: "1px solid " + (copied ? "rgba(46,204,113,0.25)" : "rgba(240,200,74,0.25)"),
        color: copied ? "#2ecc71" : "#f0c84a",
        borderRadius: 5,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 700,
        transition: "all 0.15s"
      }}>
      {copied ? "Copied!" : "Copy AI Prompt"}
    </button>
  )
}
