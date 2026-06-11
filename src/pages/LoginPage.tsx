import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const { signIn, role } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (role === 'admin') navigate('/admin', { replace: true })
    else if (role === 'guard') navigate('/guard', { replace: true })
    else if (role === 'member') navigate('/member', { replace: true })
  }, [role, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('אימייל או סיסמה שגויים')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1e3a8a 0%, #0284c7 50%, #38bdf8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, direction: 'rtl',
    }}>
      {/* Decorative circles */}
      <div style={{ position: 'fixed', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

      <div style={{
        background: 'white',
        borderRadius: 24,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        animation: 'fadeIn 0.4s ease',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            margin: '0 auto 16px',
          }}>
            <img src="/logo2.png" alt="יקנעם" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 16 }} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1e3a8a', marginBottom: 4 }}>בריכת יקנעם</h1>
          <p style={{ color: '#6b7280', fontSize: 14 }}>כניסה למערכת</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              אימייל
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={{
                  width: '100%', padding: '12px 44px 12px 14px',
                  border: '1.5px solid #e5e7eb', borderRadius: 10,
                  fontSize: 15, outline: 'none', direction: 'ltr', textAlign: 'right',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#0ea5e9')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              סיסמה
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 44px 12px 44px',
                  border: '1.5px solid #e5e7eb', borderRadius: 10,
                  fontSize: 15, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#0ea5e9')}
                onBlur={e => (e.target.style.borderColor = '#e5e7eb')}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 14, textAlign: 'center' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#9ca3af' : 'linear-gradient(135deg, #1d4ed8, #0ea5e9)',
              color: 'white', border: 'none', borderRadius: 10,
              padding: '14px', fontSize: 16, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 4,
              boxShadow: loading ? 'none' : '0 4px 14px rgba(14,165,233,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'מתחבר...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
