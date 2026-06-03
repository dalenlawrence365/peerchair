// Feature flags. Default values are for Dalen's instance.
// Other PeerChair deployments override via env vars.

export function isLinkedInConnectionsEnabled() {
  const v = (process.env.LINKEDIN_CONNECTIONS_ENABLED || "true").toLowerCase()
  return v === "true" || v === "1" || v === "yes"
}
