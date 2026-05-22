"use client"

// Shared design tokens for the new light-theme pipeline UI.
// Used by both the layout (sidebar + shell) and the StageWorkspace component.

export const T = {
  // Sidebar (kept dark — sits next to the light content area)
  sidebarBg: "#0d1729",
  sidebarBorder: "#1c2942",
  sidebarText: "#94a3b8",
  sidebarMuted: "#64748b",
  sidebarActive: "#ffffff",
  sidebarActiveBg: "#1c2942",
  sidebarSectionLabel: "#475569",

  // Surfaces
  bg: "#f7f8fa",
  cardBg: "#ffffff",
  border: "#e7e8ec",
  borderSoft: "#eff0f3",

  // Text
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textTertiary: "#94a3b8",

  // Accents
  accent: "#2563eb",
  success: "#16a34a",
  successBg: "#ecfdf5",
  warning: "#d97706",
  warningBg: "#fffbeb",
  danger: "#dc2626",
  dangerBg: "#fef2f2",

  // Stage palette
  poolBg: "#f1f5f9", poolText: "#475569",
  audienceBg: "#dbeafe", audienceText: "#1e40af",
  prospectBg: "#fce7f3", prospectText: "#9d174d",
  qualifiedBg: "#fef3c7", qualifiedText: "#92400e",
  memberBg: "#d1fae5", memberText: "#065f46",
}

export const FONT_FAMILY = '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
export const FONT_SERIF = '"Instrument Serif", serif'
