import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const API = import.meta.env.VITE_API_URL ?? ''

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'var(--text)' }) {
  return (
    <div style={s.statCard}>
      <p style={s.statLabel}>{label}</p>
      <p style={{ ...s.statValue, color }}>{value ?? '—'}</p>
      {sub && <p style={s.statSub}>{sub}</p>}
    </div>
  )
}

function Badge({ status }) {
  const map = {
    Fraud:  { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    Review: { bg: 'rgba(234,179,8,0.15)',  color: '#eab308' },
    Safe:   { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
  }
  const c = map[status] ?? map.Safe
  return (
    <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
      {status}
    </span>
  )
}

function ScoreDot({ score }) {
  const color = score >= 0.7 ? '#ef4444' : score >= 0.4 ? '#eab308' : '#22c55e'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {score?.toFixed(2)}
    </span>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,     setStats]     = useState(null)
  const [txns,      setTxns]      = useState([])
  const [alerts,    setAlerts]    = useState([])
  const [chartData, setChart]     = useState([])
  const [filter,    setFilter]    = useState('All')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [st, tx, al, ch] = await Promise.all([
        fetch(`${API}/dashboard/stats`).then(r => r.json()),
        fetch(`${API}/transactions/recent?limit=10`).then(r => r.json()),
        fetch(`${API}/alerts?limit=6`).then(r => r.json()),
        fetch(`${API}/fraud-by-hour`).then(r => r.json()),
      ])
      setStats(st)
      setTxns(tx.transactions  ?? [])
      setAlerts(al.alerts      ?? [])
      setChart(ch.data         ?? [])
      setError(null)
    } catch {
      setError('Cannot reach the backend. Make sure the API server is running on port 8000.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 30_000)  // auto-refresh every 30 s
    return () => clearInterval(id)
  }, [fetchAll])

  const filtered = filter === 'All' ? txns : txns.filter(t => t.status === filter)

  if (loading) return <div style={s.center}>Loading dashboard…</div>
  if (error)   return <div style={{ ...s.center, color: 'var(--fraud)' }}>{error}</div>

  return (
    <div>
      <h1 style={s.title}>Dashboard</h1>

      {/* ── KPI cards ── */}
      <div style={s.statsGrid}>
        <StatCard
          label="Total Transactions"
          value={stats?.total_transactions?.toLocaleString()}
          sub="All time"
        />
        <StatCard
          label="Fraud Detected"
          value={stats?.fraud_detected?.toLocaleString()}
          sub={`${stats?.fraud_percentage ?? 0}% of total`}
          color="var(--fraud)"
        />
        <StatCard
          label="PR-AUC Score"
          value={stats?.pr_auc?.toFixed(2)}
          sub="XGBoost model"
          color="var(--legit)"
        />
        <StatCard
          label="Pending Review"
          value={stats?.pending_review?.toLocaleString()}
          sub="Flagged for manual check"
          color="var(--review)"
        />
      </div>

      {/* ── Main grid ── */}
      <div style={s.mainGrid}>

        {/* Left: recent transactions */}
        <div style={s.card}>
          <div style={s.cardHead}>
            <span style={s.cardTitle}>Recent Transactions</span>
            <span style={s.cardSub}>Last 10 minutes</span>
          </div>

          {/* Filter tabs */}
          <div style={s.tabs}>
            {['All', 'Fraud', 'Safe', 'Review'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{ ...s.tab, ...(filter === f ? s.tabOn : {}) }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['ID', 'AMOUNT', 'TIME (S)', 'FRAUD SCORE', 'STATUS'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)' }}>No transactions</td></tr>
                  : filtered.map(t => (
                    <tr key={t.txn_id} style={s.tr}>
                      <td style={s.td}>{t.txn_id}</td>
                      <td style={s.td}>€{t.amount?.toFixed(2)}</td>
                      <td style={s.td}>{t.time_seconds?.toFixed(0)}</td>
                      <td style={s.td}><ScoreDot score={t.fraud_score ?? 0} /></td>
                      <td style={s.td}><Badge status={t.status} /></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: alerts + chart */}
        <div>
          {/* Live alerts */}
          <div style={s.card}>
            <span style={s.cardTitle}>Live Alerts</span>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length === 0
                ? <p style={{ color: 'var(--muted)', fontSize: 12 }}>No active alerts</p>
                : alerts.map(a => (
                  <div key={a.txn_id} style={{
                    ...s.alertRow,
                    borderLeft: `3px solid ${a.status === 'Fraud' ? 'var(--fraud)' : 'var(--review)'}`,
                  }}>
                    <div style={s.alertTitle}>
                      {a.status === 'Fraud' ? 'High-confidence fraud' : 'Manual review needed'}
                    </div>
                    <div style={s.alertSub}>{a.txn_id} · Score {a.fraud_score?.toFixed(2)}</div>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Fraud by hour */}
          <div style={s.card}>
            <span style={s.cardTitle}>Fraud by Hour</span>
            <p style={{ ...s.cardSub, marginBottom: 12 }}>Last 24 hours</p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Bar dataKey="fraud"  fill="#ef4444" radius={[3,3,0,0]} name="Fraud" />
                <Bar dataKey="review" fill="#eab308" radius={[3,3,0,0]} name="Review" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  center:    { color: 'var(--muted)', padding: 60, textAlign: 'center' },
  title:     { fontSize: 22, fontWeight: 800, marginBottom: 24, color: 'var(--text)' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 },
  statCard:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px' },
  statLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 8, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' },
  statValue: { fontSize: 26, fontWeight: 800, lineHeight: 1, marginBottom: 4 },
  statSub:   { fontSize: 11, color: 'var(--muted)' },
  mainGrid:  { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' },
  card:      { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, marginBottom: 16 },
  cardHead:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  cardSub:   { fontSize: 11, color: 'var(--muted)' },
  tabs:      { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  tab:       { padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  tabOn:     { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: 700 },
  table:     { width: '100%', borderCollapse: 'collapse' },
  th:        { textAlign: 'left', padding: '8px 10px', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td:        { padding: '10px 10px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
  tr:        { transition: 'background 0.1s' },
  alertRow:  { padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 6 },
  alertTitle:{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 },
  alertSub:  { fontSize: 11, color: 'var(--muted)' },
}
