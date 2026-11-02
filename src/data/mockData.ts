import type {
  Call, Agent, Customer, Utterance, CriticalMoment,
  EmotionType, ReviewPriority, ReviewStatus, ProcessingStatus,
  AgreementLevel, CallSummary
} from '@/types'

// Mock agents
export const mockAgents: Agent[] = [
  { id: 'A001', name: 'Nguyễn Minh Tuấn', avatar: 'NT' },
  { id: 'A002', name: 'Trần Thị Lan', avatar: 'TL' },
  { id: 'A003', name: 'Lê Hoàng Nam', avatar: 'LN' },
  { id: 'A004', name: 'Phạm Thu Hà', avatar: 'PH' },
]

// Mock customers
export const mockCustomers: Customer[] = [
  { id: 'C001', name: 'Hoàng Văn An', phone: '0912***456', segment: 'VIP' },
  { id: 'C002', name: 'Đặng Minh Châu', phone: '0983***789', segment: 'Thường' },
  { id: 'C003', name: 'Lý Thị Mai', phone: '0905***123', segment: 'Mới' },
  { id: 'C004', name: 'Vũ Đức Minh', phone: '0936***456', segment: 'VIP' },
]

// Helper to create emotion predictions
function createPrediction(
  emotion: EmotionType,
  confidence: number,
  acousticEmotion: EmotionType,
  acousticConf: number,
  lexicalEmotion: EmotionType,
  lexicalConf: number
) {
  let agreement: AgreementLevel = 'high'
  if (acousticEmotion !== lexicalEmotion) {
    agreement = 'conflict'
  } else if (Math.abs(acousticConf - lexicalConf) > 25) {
    agreement = 'partial'
  }

  return {
    acoustic: { emotion: acousticEmotion, confidence: acousticConf },
    lexical: { emotion: lexicalEmotion, confidence: lexicalConf },
    fused: { emotion, confidence },
    agreement,
  }
}

// The showcase call - detailed emotional arc with 18 utterances
// Arc: neutral → frustration → escalation → sustained anger → modality disagreement → de-escalation → recovery → positive ending
function createShowcaseCall(): Call {
  const agent = mockAgents[0] // Nguyễn Minh Tuấn
  const customer = mockCustomers[0] // Hoàng Văn An

  const startTime = new Date()
  startTime.setHours(14, 30, 0, 0)

  const utterances: Utterance[] = [
    // 1. Neutral opening - agent greeting (00:00)
    {
      id: 'u001',
      speaker: 'agent',
      text: 'Cảm ơn bạn đã gọi đến dịch vụ khách hàng, tôi là Minh từ phòng hỗ trợ. Tôi có thể giúp gì cho bạn hôm nay?',
      startTime: 0,
      endTime: 8,
      modalityPrediction: createPrediction('neutral', 78, 'neutral', 82, 'neutral', 74),
    },
    // 2. Customer neutral introduction (00:08)
    {
      id: 'u002',
      speaker: 'customer',
      text: 'Chào bạn. Tôi muốn hỏi về đơn hàng #45892 của tôi.',
      startTime: 8,
      endTime: 14,
      modalityPrediction: createPrediction('neutral', 81, 'neutral', 79, 'neutral', 83),
    },
    // 3. Agent checking (00:14)
    {
      id: 'u003',
      speaker: 'agent',
      text: 'Dạ, để tôi kiểm tra thông tin đơn hàng cho bạn. Bạn cho tôi xin mã đơn hàng chính xác nhé.',
      startTime: 14,
      endTime: 22,
      modalityPrediction: createPrediction('neutral', 85, 'neutral', 88, 'neutral', 82),
    },
    // 4. Customer provides order number (00:22)
    {
      id: 'u004',
      speaker: 'customer',
      text: 'Đơn hàng 45892, tôi đặt cách đây 5 ngày rồi mà vẫn chưa thấy giao.',
      startTime: 22,
      endTime: 30,
      modalityPrediction: createPrediction('sad', 64, 'neutral', 61, 'sad', 68),
    },
    // 5. Agent acknowledges (00:30)
    {
      id: 'u005',
      speaker: 'agent',
      text: 'Tôi hiểu, 5 ngày chờ đợi thì đúng là lâu. Để tôi kiểm tra trạng thái đơn hàng cho bạn ngay.',
      startTime: 30,
      endTime: 38,
      modalityPrediction: createPrediction('sad', 58, 'neutral', 62, 'sad', 55),
    },
    // 6. Agent finds issue (00:38)
    {
      id: 'u006',
      speaker: 'agent',
      text: 'Tôi thấy đơn hàng của bạn đang ở trạng thái chờ xác nhận thanh toán. Có vẻ như thanh toán chưa được xử lý thành công.',
      startTime: 38,
      endTime: 48,
      modalityPrediction: createPrediction('neutral', 72, 'neutral', 75, 'neutral', 70),
    },
    // 7. Customer frustration rising (00:48) - HIGH CONFIDENCE EXAMPLE
    {
      id: 'u007',
      speaker: 'customer',
      text: 'Tôi đã thanh toán rồi! Tôi đã gọi ba lần rồi mà vấn đề vẫn chưa được giải quyết. Lần nào cũng nói đang kiểm tra, đợi, chờ...',
      startTime: 48,
      endTime: 62,
      modalityPrediction: createPrediction('angry', 91, 'angry', 94, 'angry', 88),
    },
    // 8. Agent empathetic response (01:02)
    {
      id: 'u008',
      speaker: 'agent',
      text: 'Tôi rất xin lỗi vì sự bất tiện này. Việc bạn phải gọi nhiều lần là điều không nên xảy ra. Để tôi kiểm tra kỹ hơn.',
      startTime: 62,
      endTime: 72,
      modalityPrediction: createPrediction('sad', 67, 'neutral', 58, 'sad', 75),
    },
    // 9. Agent offers solution (01:12)
    {
      id: 'u009',
      speaker: 'agent',
      text: 'Tôi thấy giao dịch của bạn đã được thanh toán nhưng hệ thống chưa cập nhật. Tôi sẽ xử lý thủ công để đơn hàng được chuyển đi ngay.',
      startTime: 72,
      endTime: 84,
      modalityPrediction: createPrediction('happy', 71, 'neutral', 64, 'happy', 78),
    },
    // 10. Customer skeptical (01:24) - MODALITY DISAGREEMENT EXAMPLE
    {
      id: 'u010',
      speaker: 'customer',
      text: 'Hứa hẹn thì nhiều rồi. Lần trước cũng nói vậy mà không có gì xảy ra.',
      startTime: 84,
      endTime: 92,
      modalityPrediction: createPrediction('angry', 72, 'sad', 81, 'angry', 63),
    },
    // 11. Agent confirms with timeline (01:32)
    {
      id: 'u011',
      speaker: 'agent',
      text: 'Tôi cam kết với bạn. Đơn hàng sẽ được giao trong 24 giờ tới. Tôi sẽ gửi email xác nhận và mã theo dõi cho bạn trong 15 phút.',
      startTime: 92,
      endTime: 104,
      modalityPrediction: createPrediction('neutral', 74, 'happy', 68, 'neutral', 80),
    },
    // 12. Customer calms down slightly (01:44) - LOW CONFIDENCE EXAMPLE
    {
      id: 'u012',
      speaker: 'customer',
      text: 'Ước gì lần nào cũng được như vậy. Hy vọng lần này là thật.',
      startTime: 104,
      endTime: 112,
      modalityPrediction: createPrediction('neutral', 52, 'sad', 61, 'neutral', 43),
    },
    // 13. Agent reassuring (01:52)
    {
      id: 'u013',
      speaker: 'agent',
      text: 'Tôi hiểu tại sao bạn không tin. Tôi sẽ cập nhật trực tiếp cho bạn ngay khi đơn hàng được giao cho đơn vị vận chuyển.',
      startTime: 112,
      endTime: 122,
      modalityPrediction: createPrediction('happy', 68, 'neutral', 59, 'happy', 77),
    },
    // 14. Customer accepts (02:02)
    {
      id: 'u014',
      speaker: 'customer',
      text: 'Được rồi, tôi tin bạn lần này. Cảm ơn vì đã hỗ trợ nhiệt tình.',
      startTime: 122,
      endTime: 130,
      modalityPrediction: createPrediction('happy', 82, 'happy', 85, 'happy', 79),
    },
    // 15. Agent closing (02:10)
    {
      id: 'u015',
      speaker: 'agent',
      text: 'Cảm ơn bạn đã kiên nhẫn. Tôi đã gửi email xác nhận. Nếu có gì thêm, bạn cứ liên hệ nhé. Chúc bạn một ngày tốt lành!',
      startTime: 130,
      endTime: 140,
      modalityPrediction: createPrediction('happy', 86, 'happy', 83, 'happy', 89),
    },
    // 16. Customer positive ending (02:20)
    {
      id: 'u016',
      speaker: 'customer',
      text: 'Cảm ơn bạn Minh. Chúc bạn cũng vậy!',
      startTime: 140,
      endTime: 146,
      modalityPrediction: createPrediction('happy', 89, 'happy', 91, 'happy', 87),
    },
  ]

  const criticalMoments: CriticalMoment[] = [
    {
      id: 'cm001',
      type: 'high_confidence_change',
      timestamp: 48000,
      primaryEmotion: 'angry',
      secondaryEmotion: 'neutral',
      description: 'Chuyển đổi từ bình thường sang tức giận với độ tin cậy cao',
      utteranceIds: ['u007'],
      isRelevant: null,
    },
    {
      id: 'cm002',
      type: 'modality_disagreement',
      timestamp: 84000,
      primaryEmotion: 'sad',
      description: 'Bất đồng giữa dự đoán âm thanh và văn bản - khách hàng nói chậm nhưng từ ngữ cho thấy tức giận',
      utteranceIds: ['u010'],
      isRelevant: null,
    },
    {
      id: 'cm003',
      type: 'sustained_negative',
      timestamp: 48000,
      endTimestamp: 92000,
      primaryEmotion: 'angry',
      description: 'Khoảng thời gian tức giận kéo dài 44 giây',
      utteranceIds: ['u007', 'u008', 'u009', 'u010'],
      isRelevant: null,
    },
    {
      id: 'cm004',
      type: 'recovery',
      timestamp: 104000,
      primaryEmotion: 'happy',
      secondaryEmotion: 'angry',
      description: 'Chuyển đổi từ tức giận sang vui - khách hàng hài lòng với giải pháp',
      utteranceIds: ['u014'],
      isRelevant: null,
    },
  ]

  const summary: CallSummary = {
    dominantEmotion: 'neutral',
    negativeEmotionRatio: 0.25,
    escalationCount: 1,
    recoveryCount: 1,
    criticalMomentCount: 4,
    modalityDisagreementCount: 1,
    avgConfidence: 74,
  }

  return {
    id: 'CALL-2024-0847',
    agent,
    customer,
    startTime,
    duration: 146,
    utterances,
    criticalMoments,
    summary,
    reviewPriority: 'high',
    reviewStatus: 'unreviewed',
    processingStatus: 'ready',
  }
}

// Generate additional calls for the list
function generateRegularCalls(count: number): Call[] {
  const calls: Call[] = []

  const priorities: ReviewPriority[] = ['low', 'medium', 'high']
  const statuses: ReviewStatus[] = ['unreviewed', 'needs_review', 'reviewed']
  const procStatuses: ProcessingStatus[] = ['ready', 'processing', 'failed']

  const emotionCounts: Record<EmotionType, number> = {
    neutral: 0,
    happy: 0,
    sad: 0,
    angry: 0,
  }

  for (let i = 0; i < count; i++) {
    const agent = mockAgents[Math.floor(Math.random() * mockAgents.length)]
    const customer = mockCustomers[Math.floor(Math.random() * mockCustomers.length)]

    const startTime = new Date()
    startTime.setDate(startTime.getDate() - Math.floor(i / 3))
    startTime.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0)

    const duration = 120 + Math.floor(Math.random() * 240)
    const priority = priorities[Math.floor(Math.random() * priorities.length)]
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    const procStatus = procStatuses[Math.floor(Math.random() * procStatuses.length)]

    // Count emotions for demo
    const emotions: EmotionType[] = ['neutral', 'happy', 'sad', 'angry']
    const dominantEmotion = emotions[Math.floor(Math.random() * emotions.length)]
    emotionCounts[dominantEmotion]++

    const negativeRatio = Math.random() * 0.4
    const criticalCount = Math.floor(Math.random() * 5)
    const modalityDisagreements = Math.floor(Math.random() * 3)

    const summary: CallSummary = {
      dominantEmotion,
      negativeEmotionRatio: negativeRatio,
      escalationCount: Math.floor(Math.random() * 3),
      recoveryCount: Math.floor(Math.random() * 2),
      criticalMomentCount: criticalCount,
      modalityDisagreementCount: modalityDisagreements,
      avgConfidence: 60 + Math.floor(Math.random() * 35),
    }

    calls.push({
      id: `CALL-2024-${(1000 + i).toString()}`,
      agent,
      customer,
      startTime,
      duration,
      utterances: [],
      criticalMoments: [],
      summary,
      reviewPriority: priority,
      reviewStatus: status,
      processingStatus: procStatus,
    })
  }

  return calls
}

// Export all mock data
export function generateMockCalls(): Call[] {
  const showcaseCall = createShowcaseCall()
  const regularCalls = generateRegularCalls(49)
  return [showcaseCall, ...regularCalls]
}

export { createShowcaseCall }
