export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"

// GET /api/content-corpus
// One normalized, dated, typed feed of EVERY piece of written substance you have
// produced — so an AI can scan the whole body of work in a single pass and tell
// whether you're repeating yourself. It merges three sources:
//   - kind "script"  : content_scripts.script_text (incl. unposted ideas)
//   - kind "post"    : content_posts.body (the post copy — this is where your
//                      standalone graphic posts live, which a scripts-only scan misses)
//   - transcripts ride along on their post item (post.transcript)
// A script and the post it became share the same `content_group`, so the AI can
// treat a video's script + copy as ONE idea, not two separate hits.
export async function GET() {
  const sb = serverClient()

  const [{ data: posts, error: pErr }, { data: scripts, error: sErr }] = await Promise.all([
    sb.from("content_posts").select("id, title, format, status, body, transcript, published_at, scheduled_for, scheduled_on, created_at").order("created_at", { ascending: false }),
    sb.from("content_scripts").select("id, title, script_text, stage, linked_post_id, created_at").order("created_at", { ascending: false }),
  ])
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 })
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 })

  const postById = {}
  for (const p of (posts || [])) postById[p.id] = p
  const scriptsByPost = {}
  for (const s of (scripts || [])) {
    if (s.linked_post_id) (scriptsByPost[s.linked_post_id] = scriptsByPost[s.linked_post_id] || []).push({ id: s.id, title: s.title })
  }

  const items = []

  for (const p of (posts || [])) {
    items.push({
      kind: "post",
      id: p.id,
      content_group: p.id,
      title: p.title,
      format: p.format,
      status: p.status,
      text: p.body || null,
      transcript: p.transcript || null,
      linked_scripts: scriptsByPost[p.id] || [],
      date: p.published_at || p.scheduled_for || p.created_at,
      published_at: p.published_at,
      scheduled_for: p.scheduled_for,
      created_at: p.created_at,
    })
  }

  for (const s of (scripts || [])) {
    const post = s.linked_post_id ? postById[s.linked_post_id] : null
    items.push({
      kind: "script",
      id: s.id,
      content_group: s.linked_post_id || ("script:" + s.id),
      title: s.title,
      stage: s.stage,
      text: s.script_text || null,
      linked_post_id: s.linked_post_id || null,
      linked_post_title: post ? post.title : null,
      date: (post && (post.published_at || post.scheduled_for)) || s.created_at,
      published_at: post ? post.published_at : null,
      scheduled_for: post ? post.scheduled_for : null,
      created_at: s.created_at,
    })
  }

  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

  return Response.json({
    about: "Every piece of written content (scripts + post copy + transcripts), dated and typed, for repetition/novelty analysis. Items sharing a content_group are the same idea (a script and the post it became).",
    generated_at: new Date().toISOString(),
    count: items.length,
    posts: (posts || []).length,
    scripts: (scripts || []).length,
    items,
  })
}
