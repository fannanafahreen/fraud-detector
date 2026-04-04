import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''

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
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {score?.toFixed(3)}
    </span>
  )
}

export default function Transactions() {
  const [data,    setData]    = useState({ transactions: [], total: 0, pages: 1 })
  const [filter,  setFilter]  = useState('All')
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      page,
      per_page: 20,
      ...(filter !== 'All' ? { status: filter } : {}),
    })
    fetch(`${API}/transactions?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filter, page])

  function changeFilter(f) {
    setFilter(f)
    setPage(1)
  }

  return (
    <div>
      <h1 style={s.title}>Transactions</h1>

      {/* Filter tabs */}
      <div style={s.tabs}>
        {['All', 'Fraud', 'Review', 'Safe'].map(f => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            style={{ ...s.tab, ...(filter === f ? s.tabOn : {}) }}
          >
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
          {data.total.toLocaleString()} total
        </span>
      </div>

      {/* Table */}
      <div style={s.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                {['#', 'TXN ID', 'AMOUNT', 'TIME (S)', 'FRAUD SCORE', 'STATUS', 'TIMESTAMP'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: 'var(--muted)' }}>Loading…</td></tr>
                : data.transactions.map((t, i) => (
                  <tr key={t.txn_id} style={s.tr}>
                    <td style={{ ...s.td, color: 'var(--muted)' }}>{(page - 1) * 20 + i + 1}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{t.txn_id}</td>
                    <td style={s.td}>€{t.amount?.toFixed(2)}</td>
                    <td style={s.td}>{t.time_seconds?.toFixed(0)}</td>
                    <td style={s.td}><ScoreDot score={t.fraud_score ?? 0} /></td>
                    <td style={s.td}><Badge status={t.status} /></td>
                    <td style={{ ...s.td, fontSize: 11, color: 'var(--muted)' }}>
                      {t.timestamp ? new Date(t.timestamp).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={s.pagination}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ ...s.pgBtn, opacity: page === 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            Page {page} of {data.pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            style={{ ...s.pgBtn, opacity: page === data.pages ? 0.4 : 1 }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  title:      { fontSize: 22, fontWeight: 800, marginBottom: 20, color: 'var(--text)' },
  card:       { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '0 0 16px' },
  tabs:       { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' },
  tab:        { padding: '5px 16px', borderRadius: 20, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  tabOn:      { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', fontWeight: 700 },
  table:      { width: '100%', borderCollapse: 'collapse' },
  th:         { textAlign: 'left', padding: '12px 14px', fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td:         { padding: '11px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' },
  tr:         { transition: 'background 0.1s' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, paddingTop: 16 },
  pgBtn:      { padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', transition: 'opacity 0.15s' },
}
