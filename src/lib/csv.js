// Minimal CSV parser tuned for LinkedIn / LinkedHelper / Sales Navigator exports.
// Handles quoted fields containing commas and escaped quotes. Not RFC 4180 perfect,
// but those three formats don't push the edges.

export function parseCsv(text) {
  // Strip a UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  const lines = splitLines(text)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const cells = parseLine(line)
    const row = {}
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = (cells[c] ?? "").trim()
    }
    rows.push(row)
  }
  return { headers, rows }
}

function splitLines(text) {
  // Split on newlines BUT respect quoted fields that may span lines
  const lines = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      // Handle escaped "" inside quoted field
      if (inQuote && text[i + 1] === '"') { cur += '""'; i++; continue }
      inQuote = !inQuote
      cur += ch
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (cur.length > 0) lines.push(cur)
      cur = ""
      // skip \r\n pairs
      if (ch === "\r" && text[i + 1] === "\n") i++
    } else {
      cur += ch
    }
  }
  if (cur.length > 0) lines.push(cur)
  return lines
}

function parseLine(line) {
  const out = []
  let cur = ""
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQuote = !inQuote
    } else if (ch === "," && !inQuote) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

// Normalize a LinkedIn profile URL so de-dupe works across format variants:
//   https://www.linkedin.com/in/SomeUser/  →  https://linkedin.com/in/someuser
export function normalizeLinkedInUrl(raw) {
  if (!raw) return null
  let u = String(raw).trim()
  if (!u) return null
  // Strip protocol + www
  u = u.replace(/^https?:\/\//i, "").replace(/^www\./i, "")
  // Drop trailing slash, query, fragment
  u = u.replace(/[?#].*$/, "").replace(/\/+$/, "")
  // Lowercase the path part (linkedin slugs are case-insensitive)
  const slash = u.indexOf("/")
  if (slash >= 0) u = u.slice(0, slash) + u.slice(slash).toLowerCase()
  return "https://" + u
}

// Find the first column whose header matches any of the candidate names (case-insensitive)
export function pickField(row, candidates) {
  const keys = Object.keys(row)
  for (const cand of candidates) {
    const found = keys.find(k => k.toLowerCase().trim() === cand.toLowerCase())
    if (found) {
      const v = (row[found] || "").trim()
      if (v) return v
    }
  }
  return null
}
