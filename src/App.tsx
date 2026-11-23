import { Routes, Route } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { CallsPage } from './pages/CallsPage'
import { CallReviewPage } from './pages/CallReviewPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { UploadCallPage } from './pages/UploadCallPage'
import { BatchScanPage } from './pages/BatchScanPage'
import { ResearchPage } from './pages/ResearchPage'
import { GuidePage } from './pages/GuidePage'
import { CasesPage } from './pages/CasesPage'
import { NewCasePage } from './pages/NewCasePage'
import { CaseDetailPage } from './pages/CaseDetailPage'
import { ServiceNavigationGuard } from './components/service/ServiceNavigationGuard'

function App() {
  return (
    <ServiceNavigationGuard><AppShell>
      <Routes>
        <Route path="/" element={<CallsPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/calls/new" element={<UploadCallPage />} />
        <Route path="/scan" element={<BatchScanPage />} />
        <Route path="/calls/:callId" element={<CallReviewPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/cases" element={<CasesPage />} />
        <Route path="/cases/new" element={<NewCasePage />} />
        <Route path="/cases/:caseId" element={<CaseDetailPage />} />
        <Route path="*" element={<div className="space-y-3"><h1 className="text-2xl font-semibold">Không tìm thấy trang</h1><a href="/calls" className="text-teal-800 underline">Về danh sách cuộc gọi</a></div>} />
      </Routes>
    </AppShell></ServiceNavigationGuard>
  )
}

export default App
