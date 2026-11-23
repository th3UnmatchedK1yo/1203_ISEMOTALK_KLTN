export function FormNotice({ stale, dirty, storageError, reset, download }: { stale: boolean; dirty: boolean; storageError: boolean; reset: () => void; download: () => void }) {
  if (!dirty) return null
  return <div className={'mb-4 rounded-md border p-3 text-sm ' + (stale || storageError ? 'border-amber-400 bg-amber-50 text-amber-950' : 'border-slate-300 bg-slate-50 text-slate-800')} role={stale || storageError ? 'alert' : 'status'}>
    <p>{stale ? 'Vụ việc đã có phiên bản mới. Bản đang nhập được giữ; tải bản nháp để đối chiếu, rồi nạp dữ liệu mới trước khi lưu lại.' : storageError ? 'Trình duyệt không giữ được bản nháp. Hãy lưu hoặc tải bản nháp trước khi rời trang.' : 'Có nội dung chưa lưu.'}</p>
    <div className="mt-2 flex flex-wrap gap-4"><button type="button" onClick={download} className="font-semibold underline">Tải bản nháp</button><button type="button" onClick={reset} className="underline">Bỏ bản nháp / nạp dữ liệu đã lưu</button></div>
  </div>
}
