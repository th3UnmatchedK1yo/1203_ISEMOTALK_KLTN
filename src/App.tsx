import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard, ImportPage, QueuePage, ReviewPage, ReportingPage } from './pages/Workspace'
export default function App() {
  return <AppShell><Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/import" element={<ImportPage />} />
    <Route path="/calls" element={<QueuePage />} />
    <Route path="/calls/:callId" element={<ReviewPage />} />
    <Route path="/analytics" element={<ReportingPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppShell>
}
