import { useState } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''

export default function Settings() {
  const [amount,      setAmount]      = useState('')
  const [time,        setTime]        = useState('')
  const [result,      setResult]      = useState(null)
  const [explanation, setExplanation] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [explaining,  setExplaining]  = useState(false)
  const [error,       setError]       = useState(null)
  const [explainErr,  setExplainErr]  = useState(null)

  // ── Step 1: Predict ──────────────────────────────────────────────────────
  async function handlePredict(e) {
    e.preventDefault()
    setResult(null)
    setExplanation(null)
    setError(null)
    setExplainErr(null)

    const amountNum = parseFloat(amount)
    const timeNum   = parseFloat(time)
    if (isNaN(amountNum) || amountNum < 0) { setError('Enter a valid amount.'); return }
    if (isNaN(timeNum)   || timeNum   < 0) { setError('Enter a valid time.');   return }

    setLoading(true)
    try {
      const res = await fetch(`${API}/predict`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          amount:   amountNum,
          time:     timeNum,
          features: Array(28).fill(0),
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setError(err.message ?? 'Could not reach the backend.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Explain with LangChain/GPT ──────────────────────────────────
  async function handleExplain() {
    if (!result) return
    setExplanation(null)
    setExplainErr(null)
    setExplaining(true)

    try {
      const res = await fetch(`${API}/explain`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          txn_id:     result.txn_id,
          amount:     parseFloat(amount),
          fraud_score:result.confidence,
          status:     result.status,
          features:   Array(28).fill(0),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail ?? `Error ${res.status}`)
      }
      const d = await res.json()
      setExplanation(d.explanation)
    } catch (err) {
      setExplainErr(err.message)
    } finally {
      setExplaining(false)
    }
  }

  function handleReset() {
    setAmount('')
    setTime('')
    setResult(null)
    setExplanation(null)
    setError(null)
    setExplainErr(null)
  }

  const isFraud  = result?.result === 'Fraud'
  const isReview = result?.result === 'Review'

  return (
    <div>
      <h1 style={s.title}>Settings</h1>

      {/* ── Analyse a Transaction ── */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Analyse a Transaction</h2>
        <p style={s.cardSub}>Enter transaction details for an instant fraud prediction + AI explanation.</p>

        <form onSubmit={handlePredict}>
          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Amount (€)</label>
              <input
                style={s.input}
                type="number" step="any" min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 149.62"
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Time (seconds)</label>
              <input
                style={s.input}
                type="number" step="any" min="0"
                value={time}
                onChange={e => setTime(e.target.value)}
                placeholder="e.g. 406"
              />
            </div>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <div style={s.btnRow}>
            <button
              type="submit"
              disabled={loading}
              style={{ ...s.btn, ...s.btnPrimary, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Analysing…' : 'Analyse Transaction'}
            </button>
            <button type="button" onClick={handleReset} style={{ ...s.btn, ...s.btnSecondary }}>
              Reset
            </button>
          </div>
        </form>

        {/* ── Prediction result card ── */}
        {result && (
          <div style={{
            ...s.resultCard,
            borderColor: isFraud ? 'var(--fraud)' : isReview ? 'var(--review)' : 'var(--legit)',
            background:  isFraud ? 'var(--fraud-bg)' : isReview ? 'var(--review-bg)' : 'var(--legit-bg)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>
              {isFraud ? '⚠' : isReview ? '◉' : '✓'}
            </div>
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              color: isFraud ? 'var(--fraud)' : isReview ? 'var(--review)' : 'var(--legit)',
              marginBottom: 6,
            }}>
              {isFraud ? 'Fraudulent Transaction' : isReview ? 'Needs Manual Review' : 'Legitimate Transaction'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
              {result.txn_id} · Confidence {Math.round(result.confidence * 100)}% · Score {result.confidence.toFixed(3)}
            </div>

            {/* ── AI Explanation button ── */}
            <button
              onClick={handleExplain}
              disabled={explaining}
              style={{ ...s.btn, ...s.btnAI, opacity: explaining ? 0.7 : 1 }}
            >
              {explaining
                ? '🤖 Generating explanation…'
                : '🤖 Explain with AI (LangChain + GPT)'
              }
            </button>
          </div>
        )}

        {/* ── AI Explanation output ── */}
        {explainErr && (
          <div style={{ ...s.errorBox, marginTop: 12 }}>
            <strong>AI Error:</strong> {explainErr}
            <p style={{ marginTop: 6, fontSize: 12 }}>
              Make sure you added your OpenAI API key to <code>backend/.env</code>
            </p>
          </div>
        )}

        {explanation && (
          <div style={s.explanationBox}>
            <div style={s.explanationHeader}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>AI Explanation</span>
              <span style={s.poweredBy}>Powered by LangChain + GPT-4o-mini</span>
            </div>
            <p style={s.explanationText}>{explanation}</p>
          </div>
        )}
      </div>

      {/* ── System config ── */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>System Configuration</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[
            ['Algorithm',          'XGBoost (Gradient Boosted Trees)'],
            ['AI Explanation',     'LangChain + OpenAI GPT-4o-mini'],
            ['Auto-refresh',       'Every 30 seconds'],
            ['Fraud threshold',    '≥ 0.70'],
            ['Review threshold',   '≥ 0.40'],
            ['Dataset',            'Kaggle Credit Card Fraud 2013'],
          ].map(([k, v]) => (
            <div key={k} style={s.prefRow}>
              <span style={s.prefKey}>{k}</span>
              <span style={s.prefVal}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Setup instructions for OpenAI key ── */}
      <div style={{ ...s.card, borderColor: 'rgba(99,102,241,0.3)' }}>
        <h2 style={s.cardTitle}>🔑 Setting Up AI Explanations</h2>
        <p style={{ ...s.cardSub, marginBottom: 14 }}>
          To enable the "Explain with AI" button, add your OpenAI API key:
        </p>
        <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text)' }}>
          <li>Go to <strong>platform.openai.com/api-keys</strong> and create a key</li>
          <li>
            Create a file: <code style={s.code}>fraud-detector/backend/.env</code>
          </li>
          <li>
            Add this line: <code style={s.code}>OPENAI_API_KEY=sk-your-key-here</code>
          </li>
          <li>Restart the backend server</li>
          <li>Click "Explain with AI" after any prediction</li>
        </ol>
      </div>
    </div>
  )
}

const s = {
  title:           { fontSize: 22, fontWeight: 800, marginBottom: 24, color: 'var(--text)' },
  card:            { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 20 },
  cardTitle:       { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 },
  cardSub:         { fontSize: 12, color: 'var(--muted)', marginBottom: 20 },
  row:             { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  field:           { display: 'flex', flexDirection: 'column', gap: 6 },
  label:           { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:           { padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', width: '100%' },
  errorBox:        { background: 'rgba(239,68,68,0.1)', border: '1px solid var(--fraud)', borderRadius: 8, padding: '10px 14px', color: 'var(--fraud)', fontSize: 13, marginBottom: 14 },
  btnRow:          { display: 'flex', gap: 10 },
  btn:             { padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', transition: 'opacity 0.15s' },
  btnPrimary:      { background: 'var(--accent)', color: '#fff' },
  btnSecondary:    { background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' },
  btnAI:           { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 13 },
  resultCard:      { marginTop: 20, border: '1px solid', borderRadius: 'var(--radius)', padding: '24px', textAlign: 'center' },
  explanationBox:  { marginTop: 16, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius)', padding: '16px 20px' },
  explanationHeader:{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 },
  poweredBy:       { marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' },
  explanationText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.7 },
  prefRow:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' },
  prefKey:         { fontSize: 13, color: 'var(--muted)' },
  prefVal:         { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  code:            { background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, fontSize: 12, color: 'var(--accent)', fontFamily: 'monospace' },
}
