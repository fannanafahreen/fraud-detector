import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API = import.meta.env.VITE_API_URL ?? ''

function MetricCard({ label, value, color = 'var(--text)' }) {
  return (
    <div style={s.metricCard}>
      <p style={s.metricLabel}>{label}</p>
      <p style={{ ...s.metricValue, color }}>{value ?? '—'}</p>
    </div>
  )
}

export default function ModelPage() {
  const [metrics,    setMetrics]    = useState(null)
  const [importance, setImportance] = useState([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/model/metrics`).then(r => r.json()),
      fetch(`${API}/model/feature-importance?top=15`).then(r => r.json()),
    ])
      .then(([m, fi]) => {
        setMetrics(m)
        setImportance(fi.features ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--muted)', padding: 40 }}>Loading model data…</p>

  const cm = metrics?.confusion_matrix  // [[TN, FP], [FN, TP]]

  return (
    <div>
      <h1 style={s.title}>Model Performance</h1>
      <p style={s.sub}>XGBoost Classifier · Trained on Kaggle Credit Card Fraud dataset</p>

      {/* Metric cards */}
      <div style={s.metricsGrid}>
        <MetricCard label="PR-AUC"    value={metrics?.pr_auc?.toFixed(4)}    color="var(--legit)"  />
        <MetricCard label="Precision" value={metrics?.precision?.toFixed(4)}  color="var(--accent)" />
        <MetricCard label="Recall"    value={metrics?.recall?.toFixed(4)}     color="var(--review)" />
        <MetricCard label="F1 Score"  value={metrics?.f1?.toFixed(4)}         color="var(--text)"   />
        <MetricCard label="Threshold" value={metrics?.threshold?.toFixed(4)}  color="var(--muted)"  />
      </div>

      <div style={s.twoCol}>
        {/* Confusion matrix */}
        {cm && (
          <div style={s.card}>
            <h2 style={s.cardTitle}>Confusion Matrix</h2>
            <p style={s.cardSub}>Rows = Actual · Columns = Predicted</p>
            <div style={s.cmGrid}>
              <div style={{ gridColumn: '2', gridRow: '1', ...s.cmHeader }}>Pred. Legit</div>
              <div style={{ gridColumn: '3', gridRow: '1', ...s.cmHeader }}>Pred. Fraud</div>
              <div style={{ gridColumn: '1', gridRow: '2', ...s.cmHeader }}>Actual Legit</div>
              <div style={{ gridColumn: '1', gridRow: '3', ...s.cmHeader }}>Actual Fraud</div>
              <div style={{ ...s.cmCell, background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{cm[0][0].toLocaleString()}</div>
              <div style={{ ...s.cmCell, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>{cm[0][1].toLocaleString()}</div>
              <div style={{ ...s.cmCell, background: 'rgba(234,179,8,0.12)',  color: '#eab308' }}>{cm[1][0].toLocaleString()}</div>
              <div style={{ ...s.cmCell, background: 'rgba(34,197,94,0.20)', color: '#22c55e' }}>{cm[1][1].toLocaleString()}</div>
            </div>
            <div style={s.cmLegend}>
              <span style={{ color: '#22c55e' }}>■ True Negative / True Positive</span>
              <span style={{ color: '#ef4444' }}>■ False Positive</span>
              <span style={{ color: '#eab308' }}>■ False Negative</span>
            </div>
          </div>
        )}

        {/* Feature importance */}
        <div style={s.card}>
          <h2 style={s.cardTitle}>Top Feature Importances</h2>
          <p style={s.cardSub}>Higher = more influential in fraud detection</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              layout="vertical"
              data={importance}
              margin={{ top: 0, right: 16, left: 30, bottom: 0 }}
            >
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="feature" tick={{ fill: '#e2e8f0', fontSize: 11 }} tickLine={false} axisLine={false} width={70} />
              <Tooltip
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [v.toFixed(4), 'Importance']}
              />
              <Bar dataKey="importance" radius={[0,4,4,0]}>
                {importance.map((_, i) => (
                  <Cell key={i} fill={`hsl(${240 - i * 10}, 70%, ${65 - i * 1.5}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model info */}
      <div style={s.card}>
        <h2 style={s.cardTitle}>About This Model</h2>
        <div style={s.infoGrid}>
          {[
            ['Algorithm',    'XGBoost (Gradient Boosted Trees)'],
            ['Type',         'Supervised Binary Classification'],
            ['Imbalance',    'scale_pos_weight ≈ n_legit / n_fraud (~578×)'],
            ['Key Metric',   'PR-AUC (better than ROC-AUC for imbalanced data)'],
            ['Features',     '30 total: Time, Amount (scaled) + V1–V28 (PCA)'],
            ['Threshold',    `${metrics?.threshold?.toFixed(3)} (optimised for F1)`],
          ].map(([k, v]) => (
            <div key={k} style={s.infoRow}>
              <span style={s.infoKey}>{k}</span>
              <span style={s.infoVal}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s = {
  title:       { fontSize: 22, fontWeight: 800, marginBottom: 4, color: 'var(--text)' },
  sub:         { fontSize: 12, color: 'var(--muted)', marginBottom: 24 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 },
  metricCard:  { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' },
  metricLabel: { fontSize: 11, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' },
  metricValue: { fontSize: 22, fontWeight: 800 },
  twoCol:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card:        { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 16 },
  cardTitle:   { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 },
  cardSub:     { fontSize: 11, color: 'var(--muted)', marginBottom: 16 },
  cmGrid:      { display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gridTemplateRows: 'auto 1fr 1fr', gap: 4, marginBottom: 12 },
  cmHeader:    { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', fontSize: 10, color: 'var(--muted)', fontWeight: 600 },
  cmCell:      { borderRadius: 8, padding: '14px 8px', textAlign: 'center', fontSize: 18, fontWeight: 800 },
  cmLegend:    { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 10 },
  infoGrid:    { display: 'flex', flexDirection: 'column', gap: 10 },
  infoRow:     { display: 'flex', gap: 16, alignItems: 'baseline' },
  infoKey:     { fontSize: 12, color: 'var(--muted)', fontWeight: 600, minWidth: 100 },
  infoVal:     { fontSize: 13, color: 'var(--text)' },
}
