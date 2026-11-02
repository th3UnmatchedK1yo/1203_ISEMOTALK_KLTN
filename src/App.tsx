import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CallsPage } from './pages/CallsPage'
import { CallReviewPage } from './pages/CallReviewPage'
import { AnalyticsPage } from './pages/AnalyticsPage'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<CallsPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/calls/:callId" element={<CallReviewPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </AppShell>
  )
}

export default App
