import { useMemo } from 'react'
import { Phone, AlertTriangle, MessageSquare, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { generateMockCalls } from '@/data/mockData'
import { EMOTION_LABELS } from '@/types'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function AnalyticsPage() {
  const calls = useMemo(() => generateMockCalls(), [])

  const stats = useMemo(() => {
    const totalCalls = calls.length
    const callsNeedingReview = calls.filter((c) => c.reviewStatus !== 'reviewed').length
    const criticalMomentsTotal = calls.reduce((acc, c) => acc + c.summary.criticalMomentCount, 0)
    const totalUtterances = calls.reduce((acc, c) => acc + c.utterances.length, 0)
    const modalityDisagreements = calls.reduce((acc, c) => acc + c.summary.modalityDisagreementCount, 0)
    const modalityDisagreementRate = totalUtterances > 0 ? (modalityDisagreements / totalUtterances) * 100 : 0
    return { totalCalls, callsNeedingReview, criticalMomentsTotal, modalityDisagreementRate }
  }, [calls])

  const emotionDistribution = useMemo(() => {
    const counts = { neutral: 0, happy: 0, sad: 0, angry: 0 }
    calls.forEach((call) => { counts[call.summary.dominantEmotion]++ })
    return [
      { name: EMOTION_LABELS.neutral, value: counts.neutral, color: '#94a3b8' },
      { name: EMOTION_LABELS.happy, value: counts.happy, color: '#22c55e' },
      { name: EMOTION_LABELS.sad, value: counts.sad, color: '#3b82f6' },
      { name: EMOTION_LABELS.angry, value: counts.angry, color: '#ef4444' },
    ]
  }, [calls])

  const priorityDistribution = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    calls.forEach((call) => { counts[call.reviewPriority]++ })
    return [
      { name: 'Muc thap', value: counts.low, color: '#3b82f6' },
      { name: 'Muc trung binh', value: counts.medium, color: '#f59e0b' },
      { name: 'Muc cao', value: counts.high, color: '#ef4444' },
    ]
  }, [calls])

  const negativeRatioDistribution = useMemo(() => {
    return [
      { range: '0-15%', count: calls.filter((c) => c.summary.negativeEmotionRatio <= 0.15).length },
      { range: '15-30%', count: calls.filter((c) => c.summary.negativeEmotionRatio > 0.15 && c.summary.negativeEmotionRatio <= 0.3).length },
      { range: '30-50%', count: calls.filter((c) => c.summary.negativeEmotionRatio > 0.3 && c.summary.negativeEmotionRatio <= 0.5).length },
      { range: '>50%', count: calls.filter((c) => c.summary.negativeEmotionRatio > 0.5).length },
    ]
  }, [calls])

  const criticalMomentTypes = useMemo(() => {
    const types = { escalation: 0, recovery: 0, sustained_negative: 0, modality_disagreement: 0, high_confidence_change: 0 }
    calls.forEach((call) => { call.criticalMoments.forEach((m) => { types[m.type]++ }) })
    return [
      { name: 'Leo thang', count: types.escalation },
      { name: 'Hoi phuc', count: types.recovery },
      { name: 'Tieu cuu keo dai', count: types.sustained_negative },
      { name: 'Bat dong', count: types.modality_disagreement },
      { name: 'Thay doi cao', count: types.high_confidence_change },
    ]
  }, [calls])

  const callsNeedingAttention = useMemo(() => {
    return calls.filter((c) => c.reviewPriority === 'high' && c.reviewStatus !== 'reviewed').slice(0, 5)
  }, [calls])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bao cao phan tich</h1>
        <p className="text-sm text-muted-foreground">Thong ke ve xu ly va danh gia cuoc goi</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="rounded-full bg-blue-100 p-3"><Phone className="h-6 w-6 text-blue-600" /></div><div><p className="text-sm text-muted-foreground">Tong cuoc goi</p><p className="text-2xl font-bold">{stats.totalCalls}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="rounded-full bg-amber-100 p-3"><Clock className="h-6 w-6 text-amber-600" /></div><div><p className="text-sm text-muted-foreground">Can xem xet</p><p className="text-2xl font-bold">{stats.callsNeedingReview}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="rounded-full bg-red-100 p-3"><AlertTriangle className="h-6 w-6 text-red-600" /></div><div><p className="text-sm text-muted-foreground">Khoanh khac quan trong</p><p className="text-2xl font-bold">{stats.criticalMomentsTotal}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="rounded-full bg-purple-100 p-3"><MessageSquare className="h-6 w-6 text-purple-600" /></div><div><p className="text-sm text-muted-foreground">Ty le bat dong</p><p className="text-2xl font-bold">{stats.modalityDisagreementRate.toFixed(1)}%</p></div></div></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Phan bo cam xuc chinh</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={emotionDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{emotionDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Phan bo muc uu tien xem xet</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={priorityDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>{priorityDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Phan bo ty le cam xuc tieu cuc</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={negativeRatioDistribution}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="range" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Phan bo loai khoanh khac quan trong</CardTitle></CardHeader><CardContent><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={criticalMomentTypes}><CartesianGrid strokeDasharray="3 3" className="stroke-muted" /><XAxis dataKey="name" className="text-xs" /><YAxis className="text-xs" /><Tooltip /><Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Cuoc goi can uu tien xem xet</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="text-left py-3 px-4 font-medium">Ma cuoc goi</th><th className="text-left py-3 px-4 font-medium">Khach hang</th><th className="text-left py-3 px-4 font-medium">Agent</th><th className="text-center py-3 px-4 font-medium">Muc uu tien</th><th className="text-center py-3 px-4 font-medium">Khoanh khac QK</th><th className="text-center py-3 px-4 font-medium">Bat dong</th></tr></thead><tbody>{callsNeedingAttention.length === 0 ? (<tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Khong co cuoc goi nao can uu tien cao</td></tr>) : (callsNeedingAttention.map((call) => (<tr key={call.id} className="border-b hover:bg-slate-50"><td className="py-3 px-4 font-medium">{call.id}</td><td className="py-3 px-4">{call.customer.name}</td><td className="py-3 px-4">{call.agent.name}</td><td className="py-3 px-4 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${call.reviewPriority === 'high' ? 'bg-red-100 text-red-700' : call.reviewPriority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>Muc {call.reviewPriority === 'high' ? 'cao' : call.reviewPriority === 'medium' ? 'trung binh' : 'thap'}</span></td><td className="py-3 px-4 text-center">{call.summary.criticalMomentCount}</td><td className="py-3 px-4 text-center">{call.summary.modalityDisagreementCount > 0 && (<span className="text-amber-600">{call.summary.modalityDisagreementCount}</span>)}</td></tr>)))}</tbody></table></div></CardContent></Card>
    </div>
  )
}