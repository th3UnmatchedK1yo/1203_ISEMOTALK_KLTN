// Safety limits for browser-side batch submission. Server-side upload limits
// remain authoritative. Keep batches bounded until throughput is benchmarked.
export const MAX_BATCH_FILES = 20
export const MAX_AUDIO_BYTES = 300 * 1024 * 1024
export const MAX_BATCH_BYTES = 600 * 1024 * 1024

export function validateBatchFiles(files: ReadonlyArray<{ name: string; size: number }>): string | null {
  if (files.length === 0) return 'Chọn ít nhất một file ghi âm để AI xử lý.'
  if (files.length > MAX_BATCH_FILES) return 'Mỗi lượt thử nghiệm chỉ nhận tối đa 20 file. Hãy chia thành nhiều lượt.'
  if (files.some(file => !/\.(wav|mp3|m4a)$/i.test(file.name))) return 'Chỉ chấp nhận file âm thanh WAV, MP3 hoặc M4A.'
  if (files.some(file => !Number.isFinite(file.size) || file.size <= 0))
    return 'Có file trống hoặc kích thước không hợp lệ.'
  if (files.some(file => file.size > MAX_AUDIO_BYTES)) return 'Có file vượt giới hạn 300 MB/file.'
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES)
    return 'Tổng dung lượng một lượt không vượt quá 600 MB. Hãy chia thành nhiều lượt.'
  return null
}

export function batchProgress(jobs: ReadonlyArray<{ id?: string; status?: string; qaLabel?: string | null }>) {
  const received = jobs.filter(job => !!job.id).length
  const analyzed = jobs.filter(job => job.status === 'ready' && !!job.qaLabel).length
  const flagged = jobs.filter(job => job.status === 'ready' && job.qaLabel === 'needs_attention').length
  const failed = jobs.filter(job => job.status === 'failed' || job.status === 'upload_error').length
  return { received, analyzed, flagged, failed }
}
