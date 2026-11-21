import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CallsPage } from './pages/CallsPage'
import { CallReviewPage } from './pages/CallReviewPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { UploadCallPage } from './pages/UploadCallPage'
import { ResearchPage } from './pages/ResearchPage'

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<CallsPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/calls/new" element={<UploadCallPage />} />
        <Route path="/calls/:callId" element={<CallReviewPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="*" element={<div className="space-y-3"><h1 className="text-2xl font-semibold">Không tìm thấy trang</h1><a href="/calls" className="text-teal-800 underline">Về danh sách cuộc gọi</a></div>} />
      </Routes>
    </AppShell>
  )
}

export default App
