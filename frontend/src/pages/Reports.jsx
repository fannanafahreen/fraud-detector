import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const API = import.meta.env.VITE_API_URL ?? ''
const COLORS = ['#ef4444', '#eab308', '#22c55e']

export default function Reports() {
  const [stats,  setStats]  = useState(null)
  const [chart,  setChart]  = useState([])
  const [loading,setLoading]= useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/dashboard/stats`).then(r => r.json()),
      fetch(`${API}/fraud-by-hour`).then(r => r.json()),
    ])
      .then(([s, c]) => { setStats(s); setChart(c.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--muted)', padding: 40 }}>Loading reports…</p>

  const pieData = [
    { name: 'Fraud',     value: stats?.fraud_detected ?? 0 },
    { name: 'Review',    value: stats?.pending_review ?? 0 },
    { name: 'Safe',      value: (stats?.total_transactions ?? 0) - (stats?.fraud_detected ?? 0) - (stats?.pending_review ?? 0) },
  ]

  return (
    <div>
      <h1 style={s.title}>Reports</h1>
      <p style={s.sub}>Overview of transaction risk distribution and hourly patterns.</p>

      <div style={s.twoCol}>
        {/* Transaction distribution pie chart */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Transaction Distribution</h2>
          <p style={s.cardSub}>By classification status</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v.toLocaleString(), 'Transactions']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Summary stats */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Summary Statistics</h2>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Total Transactions',    value: stats?.total_transactions?.toLocaleString() },
              { label: 'Fraud Cases',           value: stats?.fraud_detected?.toLocaleString(),      color: '#ef4444' },
              { label: 'Under Review',          value: stats?.pending_review?.toLocaleString(),       color: '#eab308' },
              { label: 'Fraud Rate',            value: `${stats?.fraud_percentage ?? 0}%`,            color: '#ef4444' },
              { label: 'Model PR-AUC',          value: stats?.pr_auc?.toFixed(4),                    color: '#22c55e' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)' }}>{value ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly activity bar chart */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>Hourly Activity (Last 24 Hours)</h2>
        <p style={s.cardSub}>Fraud and review counts per hour</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="fraud"  fill="#ef4444" radius={[3,3,0,0]} name="Fraud"  />
            <Bar dataKey="review" fill="#eab308" radius={[3,3,0,0]} name="Review" />
            <Bar dataKey="safe"   fill="#22c55e" radius={[3,3,0,0]} name="Safe"  stackId="safe" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const s = {
  title:     { fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' },
  sub:       { fontSize: 12, color: 'var(--muted)', marginBottom: 24 },
  twoCol:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card:      { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 },
  cardSub:   { fontSize: 11, color: 'var(--muted)', marginBottom: 12 },
}
