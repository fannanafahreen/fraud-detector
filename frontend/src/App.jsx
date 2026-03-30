import { useState } from 'react'

// ── API base URL ──────────────────────────────────────────────────────────────
// In development the Vite proxy forwards /predict → http://localhost:8000/predict.
// In production set VITE_API_URL to your deployed Render backend URL.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ── Small utility components ──────────────────────────────────────────────────

/** A single labelled form field */
function Field({ label, id, value, onChange, placeholder, type = 'number', step = 'any', min = '0' }) {
  return (
    <div style={styles.fieldGroup}>
      <label htmlFor={id} style={styles.label}>{label}</label>
      <input
        id={id}
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
      />
    </div>
  )
}

/** Loading spinner (pure CSS) */
function Spinner() {
  return (
    <span style={styles.spinner} role="status" aria-label="Loading" />
  )
}

/** Result card — green for Legitimate, red for Fraud */
function ResultCard({ result, confidence }) {
  const isFraud = result === 'Fraud'
  const cardStyle = {
    ...styles.resultCard,
    background:   isFraud ? 'var(--fraud-bg)'  : 'var(--legit-bg)',
    borderColor:  isFraud ? 'var(--fraud)'     : 'var(--legit)',
  }
  const iconStyle = {
    ...styles.resultIcon,
    color: isFraud ? 'var(--fraud)' : 'var(--legit)',
  }
  const labelStyle = {
    ...styles.resultLabel,
    color: isFraud ? 'var(--fraud)' : 'var(--legit)',
  }

  // Convert confidence fraction to a display percentage
  const pct = Math.round(confidence * 100)

  // Build the arc for the circular progress ring
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct / 100)

  return (
    <div style={cardStyle} aria-live="polite">
      {/* Icon */}
      <div style={iconStyle}>
        {isFraud ? '⚠' : '✓'}
      </div>

      <div style={labelStyle}>
        {isFraud ? 'Fraudulent Transaction' : 'Legitimate Transaction'}
      </div>

      {/* Circular confidence gauge */}
      <svg width="100" height="100" viewBox="0 0 100 100" style={{ margin: '16px auto', display: 'block' }}>
        {/* Track */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        {/* Progress arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={isFraud ? 'var(--fraud)' : 'var(--legit)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        {/* Percentage text */}
        <text
          x="50" y="54"
          textAnchor="middle"
          fill="var(--text)"
          fontSize="18"
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {pct}%
        </text>
      </svg>

      <p style={styles.confidenceLabel}>
        Model confidence
      </p>
    </div>
  )
}

// ── Main App component ────────────────────────────────────────────────────────
export default function App() {
  // Core inputs
  const [amount, setAmount]   = useState('')
  const [time,   setTime]     = useState('')

  // Advanced: V1–V28 optional PCA features
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [vFeatures, setVFeatures]       = useState(Array(28).fill(''))

  // UI state
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)   // { result, confidence }
  const [error,    setError]    = useState(null)

  // Update a single V-feature by index
  function setV(index, val) {
    setVFeatures(prev => {
      const next = [...prev]
      next[index] = val
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setResult(null)
    setError(null)

    // Basic validation
    const amountNum = parseFloat(amount)
    const timeNum   = parseFloat(time)
    if (isNaN(amountNum) || amountNum < 0) {
      setError('Please enter a valid non-negative transaction amount.')
      return
    }
    if (isNaN(timeNum) || timeNum < 0) {
      setError('Please enter a valid non-negative time value.')
      return
    }

    // Convert V features — default empty strings to 0.0
    const features = vFeatures.map(v => {
      const n = parseFloat(v)
      return isNaN(n) ? 0.0 : n
    })

    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: amountNum, time: timeNum, features }),
      })

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail?.detail ?? `Server error: ${response.status}`)
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Cannot reach the backend. Make sure the API server is running.')
      } else {
        setError(err.message ?? 'An unexpected error occurred.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setAmount('')
    setTime('')
    setVFeatures(Array(28).fill(''))
    setResult(null)
    setError(null)
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>

        {/* ── Header ── */}
        <header style={styles.header}>
          <div style={styles.logo}>🛡</div>
          <h1 style={styles.title}>Fraud Detector</h1>
          <p style={styles.subtitle}>
            Powered by Isolation Forest · Enter transaction details to analyse risk
          </p>
        </header>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={styles.row}>
            <Field
              label="Amount (USD)"
              id="amount"
              value={amount}
              onChange={setAmount}
              placeholder="e.g. 149.62"
              min="0"
            />
            <Field
              label="Time (seconds)"
              id="time"
              value={time}
              onChange={setTime}
              placeholder="e.g. 406"
              min="0"
            />
          </div>

          {/* Advanced features toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            style={styles.toggleBtn}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? '▲ Hide' : '▼ Show'} advanced features (V1–V28)
          </button>

          {showAdvanced && (
            <div style={styles.advancedGrid}>
              {vFeatures.map((val, i) => (
                <Field
                  key={i}
                  label={`V${i + 1}`}
                  id={`v${i + 1}`}
                  value={val}
                  onChange={v => setV(i, v)}
                  placeholder="0.0"
                  step="any"
                />
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={styles.errorBox} role="alert">
              <span>⚠ </span>{error}
            </div>
          )}

          {/* Action buttons */}
          <div style={styles.btnRow}>
            <button
              type="submit"
              disabled={loading}
              style={{ ...styles.btn, ...styles.btnPrimary, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? <><Spinner /> Analysing…</> : 'Analyse Transaction'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              style={{ ...styles.btn, ...styles.btnSecondary }}
            >
              Reset
            </button>
          </div>
        </form>

        {/* ── Result ── */}
        {result && (
          <ResultCard result={result.result} confidence={result.confidence} />
        )}

        {/* ── Footer ── */}
        <footer style={styles.footer}>
          Model: Isolation Forest · Dataset: Kaggle Credit Card Fraud
        </footer>
      </div>
    </div>
  )
}

// ── Inline styles (avoids extra CSS file dependencies) ───────────────────────
const styles = {
  page: {
    minHeight:       '100vh',
    display:         'flex',
    alignItems:      'flex-start',
    justifyContent:  'center',
    padding:         '40px 16px',
    background:      'var(--bg)',
  },
  card: {
    width:           '100%',
    maxWidth:        640,
    background:      'var(--surface)',
    borderRadius:    'var(--radius)',
    border:          '1px solid var(--border)',
    padding:         '36px 32px',
    boxShadow:       '0 24px 64px rgba(0,0,0,0.4)',
  },
  header: {
    textAlign:       'center',
    marginBottom:    32,
  },
  logo: {
    fontSize:        48,
    marginBottom:    8,
  },
  title: {
    fontSize:        28,
    fontWeight:      800,
    letterSpacing:   '-0.5px',
    color:           'var(--text)',
  },
  subtitle: {
    marginTop:       6,
    fontSize:        14,
    color:           'var(--muted)',
  },
  row: {
    display:         'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:             16,
    marginBottom:    16,
  },
  fieldGroup: {
    display:         'flex',
    flexDirection:   'column',
    gap:             6,
  },
  label: {
    fontSize:        13,
    fontWeight:      600,
    color:           'var(--muted)',
    textTransform:   'uppercase',
    letterSpacing:   '0.05em',
  },
  input: {
    padding:         '10px 14px',
    background:      'var(--surface-2)',
    border:          '1px solid var(--border)',
    borderRadius:    8,
    color:           'var(--text)',
    fontSize:        15,
    outline:         'none',
    width:           '100%',
    transition:      'border-color 0.2s',
  },
  toggleBtn: {
    background:      'transparent',
    border:          '1px solid var(--border)',
    color:           'var(--muted)',
    borderRadius:    8,
    padding:         '8px 14px',
    fontSize:        13,
    cursor:          'pointer',
    marginBottom:    16,
    width:           '100%',
    textAlign:       'left',
    transition:      'color 0.2s, border-color 0.2s',
  },
  advancedGrid: {
    display:         'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap:             10,
    marginBottom:    20,
    padding:         '16px',
    background:      'var(--surface-2)',
    borderRadius:    8,
    border:          '1px solid var(--border)',
    maxHeight:       320,
    overflowY:       'auto',
  },
  errorBox: {
    background:      'rgba(239,68,68,0.12)',
    border:          '1px solid var(--fraud)',
    borderRadius:    8,
    padding:         '12px 16px',
    color:           'var(--fraud)',
    fontSize:        14,
    marginBottom:    16,
  },
  btnRow: {
    display:         'flex',
    gap:             12,
    marginTop:       8,
  },
  btn: {
    flex:            1,
    padding:         '12px 20px',
    borderRadius:    8,
    fontSize:        15,
    fontWeight:      600,
    border:          'none',
    cursor:          'pointer',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    transition:      'background 0.2s, opacity 0.2s',
  },
  btnPrimary: {
    background:      'var(--accent)',
    color:           '#fff',
  },
  btnSecondary: {
    background:      'var(--surface-2)',
    color:           'var(--muted)',
    border:          '1px solid var(--border)',
  },
  spinner: {
    display:         'inline-block',
    width:           16,
    height:          16,
    border:          '2px solid rgba(255,255,255,0.3)',
    borderTopColor:  '#fff',
    borderRadius:    '50%',
    animation:       'spin 0.7s linear infinite',
  },
  resultCard: {
    marginTop:       28,
    border:          '1px solid',
    borderRadius:    'var(--radius)',
    padding:         '24px 20px 20px',
    textAlign:       'center',
    transition:      'all 0.3s ease',
  },
  resultIcon: {
    fontSize:        40,
    lineHeight:      1,
    marginBottom:    8,
  },
  resultLabel: {
    fontSize:        22,
    fontWeight:      800,
    marginBottom:    4,
  },
  confidenceLabel: {
    fontSize:        13,
    color:           'var(--muted)',
  },
  footer: {
    marginTop:       32,
    textAlign:       'center',
    fontSize:        12,
    color:           'var(--muted)',
    borderTop:       '1px solid var(--border)',
    paddingTop:      16,
  },
}

// Inject spinner keyframe animation (no CSS file needed)
const spinnerStyle = document.createElement('style')
spinnerStyle.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(spinnerStyle)
