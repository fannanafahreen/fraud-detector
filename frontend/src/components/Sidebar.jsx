import { NavLink } from 'react-router-dom'

const NAV = [
  { label: 'Dashboard',    to: '/',             icon: '⬡' },
  { label: 'Transactions', to: '/transactions', icon: '≡' },
  { label: 'Alerts',       to: '/alerts',       icon: '⚠' },
  { label: 'Model',        to: '/model',        icon: '◎' },
  { label: 'Reports',      to: '/reports',      icon: '▦' },
  { label: 'Settings',     to: '/settings',     icon: '⚙' },
]

export default function Sidebar() {
  return (
    <nav style={s.nav}>
      {/* Logo */}
      <div style={s.logo}>
        <span style={{ fontSize: 22 }}>🛡</span>
        <span style={s.logoText}>FraudGuard</span>
      </div>

      {/* Links */}
      <ul style={s.list}>
        {NAV.map(({ label, to, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({ ...s.link, ...(isActive ? s.active : {}) })}
            >
              <span style={s.icon}>{icon}</span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div style={s.footer}>XGBoost · v2.0</div>
    </nav>
  )
}

const s = {
  nav:      { width: 210, minHeight: '100vh', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  logo:     { display: 'flex', alignItems: 'center', gap: 10, padding: '22px 20px', borderBottom: '1px solid var(--border)' },
  logoText: { fontSize: 16, fontWeight: 800, color: 'var(--text)' },
  list:     { listStyle: 'none', padding: '12px 0', flex: 1 },
  link:     { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', color: 'var(--muted)', textDecoration: 'none', fontSize: 13, fontWeight: 500, borderLeft: '3px solid transparent', transition: 'all 0.15s' },
  active:   { color: 'var(--accent)', background: 'rgba(99,102,241,0.08)', borderLeft: '3px solid var(--accent)', fontWeight: 700 },
  icon:     { width: 18, textAlign: 'center', fontSize: 15 },
  footer:   { padding: '16px 20px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)' },
}
