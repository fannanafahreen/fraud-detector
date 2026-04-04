import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''

function SeverityIcon({ status }) {
  if (status === 'Fraud')  return <span style={{ color: '#ef4444', fontSize: 18 }}>⬤</span>
  if (status === 'Review') return <span style={{ color: '#eab308', fontSize: 18 }}>◐</span>
  return <span style={{ color: '#22c55e', fontSize: 18 }}>○</span>
}

export default function Alerts() {
  const [alerts,  setAlerts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('All')

  useEffect(() => {
    fetch(`${API}/alerts?limit=100`)
      .then(r => r.json())
      .then(d => { setAlerts(d.alerts ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const shown = filter === 'All'
    ? alerts
    : alerts.filter(a => a.status === filter)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={s.title}>Alerts</h1>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{shown.length} alerts</span>
      </div>

      {/* Filter */}
      <div style={s.tabs}>
        {['All', 'Fraud', 'Review'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...s.tab, ...(filter === f ? s.tabOn : {}) }}>
            {f}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading
        ? <p style={{ color: 'var(--muted)' }}>Loading…</p>
        : shown.length === 0
          ? <div style={s.empty}>No alerts to display</div>
          : shown.map(a => (
            <div key={a.txn_id} style={{
              ...s.alertCard,
              borderLeft: `4px solid ${a.status === 'Fraud' ? 'var(--fraud)' : 'var(--review)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SeverityIcon status={a.status} />
                <div style={{ flex: 1 }}>
                  <div style={s.alertTitle}>
                    {a.status === 'Fraud' ? 'High-confidence fraud detected' : 'Manual review recommended'}
                  </div>
                  <div style={s.alertMeta}>
                    {a.txn_id} · Amount €{a.amount?.toFixed(2)} · Score {a.fraud_score?.toFixed(3)}
                    {a.timestamp && ` · ${new Date(a.timestamp).toLocaleString()}`}
                  </div>
                </div>
                <div style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  background: a.status === 'Fraud' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                  color: a.status === 'Fraud' ? '#ef4444' : '#eab308',
                }}>
                  {a.status}
                </div>
              </div>
            </div>
          ))
      }
    </div>
  )
}

const s = {
  title:      { fontSize: 22, fontWeight: 800, color: 'var(--text)' },
  tabs:       { display: 'flex', gap: 8, marginBottom: 16 },
  tab:        { padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  tabOn:      { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: 700 },
  alertCard:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 10 },
  alertTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 },
  alertMeta:  { fontSize: 11, color: 'var(--muted)' },
  empty:      { textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 14 },
}
