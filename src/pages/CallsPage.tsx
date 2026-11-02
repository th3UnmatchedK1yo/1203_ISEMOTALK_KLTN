import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, User, Calendar, Clock, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from '@/components/ui/pagination'
import { generateMockCalls, mockAgents } from '@/data/mockData'
import { formatDate, formatDuration } from '@/lib/utils'
import { getReviewStatusColor, getProcessingStatusColor } from '@/lib/utils'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { EmotionBadge } from '@/components/ui/EmotionBadge'
import type { Call } from '@/types'
import { REVIEW_STATUS_LABELS, PROCESSING_STATUS_LABELS } from '@/types'

const ITEMS_PER_PAGE = 10

export function CallsPage() {
  const navigate = useNavigate()
  const calls = useMemo(() => generateMockCalls(), [])
  
  const [search, setSearch] = useState('')
  const [agentFilter, setAgentFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchesSearch = search === '' || 
        call.id.toLowerCase().includes(search.toLowerCase()) ||
        call.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        call.agent.name.toLowerCase().includes(search.toLowerCase())
      
      const matchesAgent = agentFilter === 'all' || call.agent.id === agentFilter
      const matchesPriority = priorityFilter === 'all' || call.reviewPriority === priorityFilter
      const matchesReviewStatus = reviewStatusFilter === 'all' || call.reviewStatus === reviewStatusFilter
      
      return matchesSearch && matchesAgent && matchesPriority && matchesReviewStatus
    })
  }, [calls, search, agentFilter, priorityFilter, reviewStatusFilter])

  const totalPages = Math.ceil(filteredCalls.length / ITEMS_PER_PAGE)
  const paginatedCalls = filteredCalls.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Danh sách cuộc gọi</h1>
          <p className="text-sm text-muted-foreground">
            Xem xét và phân loại các cuộc gọi theo mức độ ưu tiên
          </p>
        </div>
        <div className="text-sm text-slate-500">
          {filteredCalls.length} cuộc gọi
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm theo mã cuộc gọi, tên..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-9"
              />
            </div>

            <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <User className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả Agent</SelectItem>
                {mockAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-[160px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Mức ưu tiên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="high">Mức cao</SelectItem>
                <SelectItem value="medium">Mức trung bình</SelectItem>
                <SelectItem value="low">Mức thấp</SelectItem>
              </SelectContent>
            </Select>

            <Select value={reviewStatusFilter} onValueChange={(v) => { setReviewStatusFilter(v); setCurrentPage(1) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="unreviewed">Chưa xem</SelectItem>
                <SelectItem value="needs_review">Cần xem xét</SelectItem>
                <SelectItem value="reviewed">Đã xem xét</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {paginatedCalls.map((call) => (
              <CallRow key={call.id} call={call} onClick={() => navigate(`/calls/${call.id}`)} />
            ))}
          </div>
          {paginatedCalls.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Không tìm thấy cuộc gọi nào
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1))
              .map((page, idx, arr) => {
                const showEllipsisBefore = idx > 0 && arr[idx - 1] !== page - 1
                return (
                  <span key={page} className="flex items-center">
                    {showEllipsisBefore && <PaginationEllipsis />}
                    <PaginationItem>
                      <PaginationLink
                        isActive={currentPage === page}
                        onClick={() => setCurrentPage(page)}
                        className="cursor-pointer"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  </span>
                )
              })}
            
            <PaginationItem>
              <PaginationNext
                onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}

interface CallRowProps {
  call: Call
  onClick: () => void
}

function CallRow({ call, onClick }: CallRowProps) {
  const hasModalityDisagreement = call.summary.modalityDisagreementCount > 0
  const negativeRatio = (call.summary.negativeEmotionRatio * 100).toFixed(0)

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-4 hover:bg-accent/50 cursor-pointer transition-colors"
    >
      <Avatar className="h-10 w-10">
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {call.agent.avatar}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">{call.customer.name}</span>
          <span className="text-sm text-slate-400">•</span>
          <span className="text-sm text-slate-500">{call.agent.name}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{call.id}</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(call.startTime)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(call.duration)}
          </span>
        </div>
      </div>

      <div className="flex-shrink-0">
        <PriorityBadge priority={call.reviewPriority} size="sm" showIcon />
      </div>

      <div className="hidden lg:flex items-center gap-4 text-sm">
        <EmotionBadge emotion={call.summary.dominantEmotion} size="sm" />
        
        <div className="text-center min-w-[50px]">
          <div className={`text-sm font-medium ${parseInt(negativeRatio) > 30 ? 'text-red-600' : 'text-slate-600'}`}>
            {negativeRatio}%
          </div>
          <div className="text-xs text-slate-400">Tiêu cực</div>
        </div>

        <div className="text-center min-w-[50px]">
          <div className={`text-sm font-medium ${call.summary.criticalMomentCount > 2 ? 'text-red-600' : 'text-slate-600'}`}>
            {call.summary.criticalMomentCount}
          </div>
          <div className="text-xs text-slate-400">Quan trọng</div>
        </div>

        <div className={`flex items-center gap-1 min-w-[40px] ${hasModalityDisagreement ? 'text-amber-600' : 'text-slate-400'}`}>
          {hasModalityDisagreement && <AlertTriangle className="h-3.5 w-3.5" />}
          <span className="text-sm">{call.summary.modalityDisagreementCount}</span>
        </div>
      </div>

      <div className="flex-shrink-0">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getReviewStatusColor(call.reviewStatus)}`}>
          {REVIEW_STATUS_LABELS[call.reviewStatus]}
        </span>
      </div>

      <div className="flex-shrink-0">
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getProcessingStatusColor(call.processingStatus)}`}>
          {PROCESSING_STATUS_LABELS[call.processingStatus]}
        </span>
      </div>
    </div>
  )
}