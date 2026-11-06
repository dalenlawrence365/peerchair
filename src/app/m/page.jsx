"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function MobileIndex() {
  const router = useRouter()
  useEffect(function () { router.replace("/m/admit") }, [router])
  return null
}
