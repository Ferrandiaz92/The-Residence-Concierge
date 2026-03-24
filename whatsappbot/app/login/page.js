// app/login/page.js
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      router.push('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--green-900)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font)', padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontSize: '22px', fontWeight: '600',
            color: 'var(--gold)', letterSpacing: '0.3px',
          }}>
            The Residence
          </div>
          <div style={{
            fontSize: '13px', color: 'rgba(255,255,255,0.4)',
            letterSpacing: '2px', textTransform: 'uppercase',
            marginTop: '4px',
          }}>
            Concierge Platform
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
        }}>
          <div style={{
            fontSize: '16px', fontWeight: '500',
            color: 'white', marginBottom: '6px',
          }}>
            Sign in
          </div>
          <div style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.4)',
            marginBottom: '24px',
          }}>
            Hotel staff access
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{
                fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                display: 'block', marginBottom: '6px', fontWeight: '500',
                textTransform: 'uppercase', letterSpacing: '0.8px',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@hotel.com"
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white', fontSize: '14px',
                  outline: 'none', fontFamily: 'var(--font)',
                }}
              />
            </div>

            <div>
              <label style={{
                fontSize: '11px', color: 'rgba(255,255,255,0.5)',
                display: 'block', marginBottom: '6px', fontWeight: '500',
                textTransform: 'uppercase', letterSpacing: '0.8px',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white', fontSize: '14px',
                  outline: 'none', fontFamily: 'var(--font)',
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(217,64,64,0.12)',
                border: '0.5px solid rgba(217,64,64,0.3)',
                borderRadius: 'var(--radius-sm)',
                color: '#FCA5A5', fontSize: '12px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: loading ? 'rgba(201,168,76,0.5)' : 'var(--gold)',
                border: 'none', borderRadius: 'var(--radius-sm)',
                color: 'var(--green-900)', fontSize: '14px',
                fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font)', marginTop: '4px',
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{
          textAlign: 'center', marginTop: '24px',
          fontSize: '11px', color: 'rgba(255,255,255,0.2)',
        }}>
          The Residence Concierge · Staff Portal
        </div>
      </div>
    </div>
  )
}
