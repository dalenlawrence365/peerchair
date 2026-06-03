// Public asset share page — accessible without PeerChair auth.
// URL pattern: https://www.peerchair.com/share/<slug>
//
// Flow:
//   1. LinkedIn user clicks the URL in a DM
//   2. LinkedIn's crawler fetches first → reads OG meta tags → renders preview card
//   3. User clicks the preview → lands here
//   4. Sees a branded card with title + description + "Open PDF" button
//   5. Clicks button → opens the PDF in a new tab via a fresh signed URL
//
// Why a landing page instead of direct PDF redirect:
//   - LinkedIn preview cards render from OG tags on the URL, not from the PDF
//   - Users see context before opening (less alarming than auto-download)
//   - We can swap PDF versions without changing the URL (slug stays stable)
//   - Logs each visit if we add tracking later

import { serverClient } from "@/lib/supabaseServer"
import { notFound } from "next/navigation"

export const revalidate = 0 // No ISR — page is cheap to render, signed URLs need freshness

// Generate dynamic metadata for OG preview cards in LinkedIn / Slack / iMessage
export async function generateMetadata({ params }) {
  const { slug } = await params
  const sb = serverClient()
  const { data: asset } = await sb
    .from("chapter_assets")
    .select("display_name, description")
    .eq("slug", slug)
    .single()

  if (!asset) {
    return { title: "PeerChair", description: "Not found" }
  }

  const title = `${asset.display_name} — CFO Circle Los Angeles`
  const description = asset.description ||
    "CFO Circle Los Angeles — confidential monthly peer advisory groups for CFOs of privately held and PE-backed companies."

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "CFO Circle Los Angeles",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  }
}

export default async function SharePage({ params }) {
  const { slug } = await params
  const sb = serverClient()

  const { data: asset, error } = await sb
    .from("chapter_assets")
    .select("slug, display_name, description, current_file_path, current_file_original_name, current_file_size_bytes, current_file_uploaded_at")
    .eq("slug", slug)
    .single()

  if (error || !asset || !asset.current_file_path) {
    notFound()
  }

  // Generate a fresh 1-hour signed URL each time the page renders.
  // The URL goes into the "Open PDF" button; user clicks it to fetch the file.
  const { data: signed } = await sb.storage
    .from("chapter-assets")
    .createSignedUrl(asset.current_file_path, 60 * 60)
  const pdfUrl = signed?.signedUrl

  const sizeMB = asset.current_file_size_bytes
    ? (asset.current_file_size_bytes / 1024 / 1024).toFixed(1)
    : null

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #080f1a 0%, #0f1a2e 100%)",
      padding: "2rem",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    }}>
      <div style={{
        maxWidth: 540,
        width: "100%",
        background: "#0f1a2e",
        border: "1px solid #1f3a5f",
        borderRadius: 16,
        padding: "2.5rem 2rem",
        textAlign: "center",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}>
        <div style={{
          fontSize: 14,
          color: "#7aa3d6",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
        }}>
          CFO Circle · Los Angeles
        </div>

        <h1 style={{
          color: "#fff",
          fontSize: 26,
          fontWeight: 600,
          margin: "0 0 1rem",
          lineHeight: 1.3,
        }}>
          {asset.display_name}
        </h1>

        {asset.description && (
          <p style={{
            color: "#a8c0dd",
            fontSize: 15,
            lineHeight: 1.6,
            margin: "0 0 2rem",
          }}>
            {asset.description}
          </p>
        )}

        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              background: "#3b82f6",
              color: "#fff",
              textDecoration: "none",
              padding: "0.875rem 2rem",
              borderRadius: 8,
              fontSize: 16,
              fontWeight: 600,
              transition: "background 150ms",
            }}
          >
            Open PDF{sizeMB ? ` · ${sizeMB} MB` : ""} →
          </a>
        ) : (
          <div style={{ color: "#7aa3d6", fontSize: 14 }}>
            Document temporarily unavailable. Please try again shortly.
          </div>
        )}

        <div style={{
          marginTop: "2.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid #1f3a5f",
          color: "#5a7ba8",
          fontSize: 12,
        }}>
          A Blueprint for Growth chapter
        </div>
      </div>
    </main>
  )
}
