'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const App = dynamic(() => import('@/components/App'), { ssr: false })

const PASSWORD = '19103Darwin$'
const KEY = 'pc_auth'

export default function Home() {
  const [auth, setAuth] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(function() {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(KEY) === 'ok') setAuth(true)
    }
    setChecking(false)
  }, [])

  function submit(e) {
    e.preventDefault()
    if (input === PASSWORD) {
      localStorage.setItem(KEY, 'ok')
      setAuth(true)
    } else {
      setError(true)
      setInput('')
      setTimeout(function(){ setError(false) }, 2000)
    }
  }

  if (checking) return null

  if (!auth) return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#080f1a',
      fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,serif"
    }}>
      <div style={{
        background:'#0f1e2e', border:'1px solid rgba(240,200,74,0.2)',
        borderRadius:12, padding:'48px 40px', width:340,
        boxShadow:'0 20px 60px rgba(0,0,0,0.6)'
      }}>
        <div style={{textAlign:'center', marginBottom:32}}>
          <div style={{fontSize:13,fontWeight:700,color:'#f0c84a',letterSpacing:3,textTransform:'uppercase',marginBottom:6}}>PeerChair</div>
          <div style={{fontSize:11,color:'#3a5a74',letterSpacing:2,textTransform:'uppercase'}}>Chapter Director Platform</div>
        </div>
        <form onSubmit={submit}>
          <input
            type="password"
            value={input}
            onChange={function(e){ setInput(e.target.value) }}
            placeholder="Enter password"
            autoFocus
            style={{
              width:'100%', padding:'12px 14px', borderRadius:6,
              background:'#080f1a', border: error ? '1px solid #e74c3c' : '1px solid rgba(255,255,255,0.1)',
              color:'#e8f2ff', fontSize:14, outline:'none',
              fontFamily:'inherit', boxSizing:'border-box',
              transition:'border-color 0.2s'
            }}
          />
          {error && <div style={{color:'#e74c3c',fontSize:11,marginTop:6,textAlign:'center'}}>Incorrect password</div>}
          <button type="submit" style={{
            width:'100%', marginTop:16, padding:'12px',
            background:'rgba(240,200,74,0.15)', border:'1px solid rgba(240,200,74,0.4)',
            color:'#f0c84a', borderRadius:6, cursor:'pointer',
            fontSize:13, fontWeight:600, letterSpacing:1,
            fontFamily:'inherit'
          }}>
            Enter
          </button>
        </form>
      </div>
    </div>
  )

  return <App />
}
