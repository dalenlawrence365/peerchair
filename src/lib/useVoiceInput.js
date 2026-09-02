"use client"
import { useState, useRef, useEffect, useCallback } from "react"

// Shared voice-capture hook — used by any tab that lets Dalen speak
// instructions instead of typing (Draft Email, Draft DM, ...). Wraps the
// Web Speech API; falls back to `supported: false` so callers can show a
// "type instead" notice in unsupported browsers.
export function useVoiceInput() {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [text, setText] = useState("")
  const recognitionRef = useRef(null)
  const baseTextRef = useRef("")

  useEffect(function () {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) { setSupported(false); return }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = "en-US"
    rec.onresult = function (e) {
      let finalText = ""
      let interimText = ""
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript + " "
        else interimText += r[0].transcript
      }
      const base = baseTextRef.current
      setText((base ? base + " " : "") + finalText + interimText)
    }
    rec.onerror = function () { setListening(false) }
    rec.onend = function () { setListening(false) }
    recognitionRef.current = rec
    return function () { try { rec.stop() } catch (e) {} }
  }, [])

  const toggleListening = useCallback(function () {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      baseTextRef.current = text.trim()
      try { rec.start(); setListening(true) } catch (e) {}
    }
  }, [listening, text])

  function reset() { setText(""); baseTextRef.current = "" }

  return { supported, listening, text, setText, toggleListening, reset }
}
