// Recent calendar meetings with a person, as prompt text for the AI drafters
// (Draft Email / Draft DM). Granola summary is the main signal; Dalen's own
// notes ride along when they exist. Transcripts are NEVER included -- they are
// long and would slow and dilute the draft.
const SUMMARY_CAP = 1500
const NOTE_CAP = 600

export async function recentMeetingContext(sb, personId, limit = 3) {
  try {
    const nowIso = new Date().toISOString()
    const [{ data: att }, { data: direct }] = await Promise.all([
      sb.from("meeting_attendees").select("meeting_id").eq("person_id", personId),
      sb.from("meetings").select("id").eq("person_id", personId).lte("starts_at", nowIso).limit(50),
    ])
    const ids = [...new Set([...(att || []).map(r => r.meeting_id), ...(direct || []).map(r => r.id)])]
    if (!ids.length) return ""
    const { data: meetings } = await sb.from("meetings").select("id, title, starts_at")
      .in("id", ids).lte("starts_at", nowIso).order("starts_at", { ascending: false }).limit(limit)
    if (!meetings || !meetings.length) return ""
    const { data: notes } = await sb.from("meeting_notes").select("meeting_id, source, body, created_at")
      .in("meeting_id", meetings.map(m => m.id)).neq("source", "granola_transcript").order("created_at", { ascending: true })
    const lines = []
    for (const m of meetings) {
      const mine = (notes || []).filter(n => n.meeting_id === m.id)
      const summary = mine.filter(n => n.source === "granola_summary" || n.source === "granola")
      const own = mine.filter(n => n.source !== "granola_summary" && n.source !== "granola")
      if (!summary.length && !own.length) continue
      let t = `- ${String(m.starts_at).slice(0, 10)} [meeting] ${m.title || "Meeting"}`
      if (summary.length) t += `: Granola summary: ${summary[0].body.slice(0, SUMMARY_CAP)}`
      if (own.length) t += ` | Dalen's own notes (secondary to the summary; may be brief): ${own.map(n => n.body.slice(0, NOTE_CAP)).join(" / ")}`
      lines.push(t)
    }
    return lines.join("\n")
  } catch (e) { return "" }
}
