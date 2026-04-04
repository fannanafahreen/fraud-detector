import { Routes, Route } from 'react-router-dom'
import Sidebar      from './components/Sidebar'
import Dashboard    from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Alerts       from './pages/Alerts'
import ModelPage    from './pages/ModelPage'
import Reports      from './pages/Reports'
import Settings     from './pages/Settings'

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', maxHeight: '100vh' }}>
        <Routes>
          <Route path="/"             element={<Dashboard />}    />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/alerts"       element={<Alerts />}       />
          <Route path="/model"        element={<ModelPage />}    />
          <Route path="/reports"      element={<Reports />}      />
          <Route path="/settings"     element={<Settings />}     />
        </Routes>
      </main>
    </div>
  )
}
