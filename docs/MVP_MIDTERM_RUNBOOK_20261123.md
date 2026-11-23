# ISEmoTalk — MVP giua ky tren Windows + FTISU (23/11/2026)

## Pham vi MVP tai thoi diem GPU dang train

- Windows chi chay React/Vite, khong can Python/torch/SQLite tai laptop.
- FTISU chay Express/SQLite o 127.0.0.1:3101; Python ASR/SER/QA duoc TAM DUNG trong `remote:api-preview` de khong tranh GPU.
- Ban preview ho tro xem calls, import **ket qua JSON/CSV KHONG kem audio**, review/chinh transcript, workflow/cases/tasks, analytics/export.
- Ban preview **khong** ho tro upload audio, import audio, retry job model, hoac chay QA classifier.
- Moi ket qua nhap duoc danh dau `provenance=imported`. Mau `docs/sample-results.json` la **vi du minh hoa, khong phai ket qua AI that**.
- Duong suy luan that PhoWhisper + F4/other SER + QA la phase sau khi GPU het train va tung model duoc xac minh; khong thay mock bang nhan real de demo.

## A. Test thong tunnel tren Windows

Khi `Test-NetConnection 127.0.0.1 -Port 13001` la True, moi chi biet TCP local listener dang nhan ket noi. Chua biet local forward co noi dung FTISU API hay khong.

Trong WINDOWS PowerShell (khong phai terminal `emotalk@ftisu`):

```powershell
curl.exe --noproxy "*" --connect-timeout 3 --max-time 8 -i http://127.0.0.1:13001/api/system/status
```

Phai nhan HTTP 200 va JSON co `"api":"ok"`. O ban moi, `"previewOnly":true` va `"inference":{"reachable":false,...}` la **dung** trong luc train. Neu curl that bai: xem log ssh, khong cai lai Node/torch hay xoa database.

Neu can tunnel thu cong, **dung** VS Code Port Forwarding tren local 13001 truoc de tranh conflict, sau do mo mot Windows PowerShell rieng:

```powershell
ssh -o ExitOnForwardFailure=yes -N -L 127.0.0.1:13001:127.0.0.1:3101 ftisu-ser
```

`ftisu-ser` la vi du alias; thay bang SSH host/alias da dung de dang nhap FTISU. Giu cua so nay mo. Mot local listener bi chiem cong khong co nghia tunnel dang chay dung.

FTISU kiem tra neu Windows HTTP van khong duoc:

```bash
curl -sS --max-time 8 -i http://127.0.0.1:3101/api/system/status
```

## B. FTISU API preview — cap nhat code khong dung GPU runner

Chay tren FTISU. **Chi** tat terminal `remote:api-preview` bang Ctrl+C (neu dang chay) sau khi da luu nhap lieu tren browser; khong tat training runner.

```bash
cd ~/services/isemotalk
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
source ~/.local/share/isemotalk-node-env.sh
npm run remote:api-preview
```

Giu API terminal mo. Trong terminal FTISU khac: `bash scripts/monitor-parallel.sh` (read-only). Chay **khong** lap lai `run-qa-replications.sh` khi job cu van dang chay.

## C. Windows browser preview

Tren Windows PowerShell trong repo, sau khi curl tren qua tunnel tra HTTP 200:

```powershell
cd C:\Users\Legion\Documents\1203_KLTN
git status --short
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 13001
```

Lenh nay build va chi chay frontend, mo `http://127.0.0.1:5173`. Giu terminal foreground. Sau do mo **PowerShell thu hai** tai repo Windows va chay `npm run remote:mvp-check` de kiem tra read-only API, SQLite contracts, frontend HTML va Vite /api proxy qua tunnel. Lenh kiem tra khong ghi DB, khong goi Python va khong can GPU. Neu local co file chua commit, khong reset/clean/force checkout; `db-check-result.json` untracked duoc giu.

## D. Kich ban MVP khong model, khong GPU — 4 den 6 phut

1. **Calls:** mo queue, xem provenance va processing/review status. Neu database remote trong la binh thuong: khong auto-seed.
2. **Them cuoc goi -> Nhap ket qua co san:** chon `docs/sample-results.json` tu repo Windows, **de trong file audio**. Ket qua `provenance=imported`, khong tu suy luan.
3. **Review:** xem transcript, nhan du doan da nhap va status stage; sua/ghi chu va Save. Ket qua minh hoa trong mau khong phai ket qua that; khong trinh bay confidence mau la do chinh xac.
4. **Cases:** tao vu viec hoac lien ket ho so, giao task, hen goi lai, ghi nhan ket qua, thu cho dong vu viec khi con task chua hoan tat.
5. **Analytics:** kiem tra source filter va export CSV, theo doi review.
6. **MVP acceptance:** refresh browser, xem du lieu van con; khong thay `status=failed` do model khi chi import results no-audio. Neu login/reviewer audit chua co thi khong bao cao la da co.

Co the kiem chung backend read-only:

```powershell
curl.exe --noproxy "*" --max-time 8 -i http://127.0.0.1:13001/api/calls
curl.exe --noproxy "*" --max-time 8 -i http://127.0.0.1:13001/api/cases
curl.exe --noproxy "*" --max-time 8 -i http://127.0.0.1:13001/api/analytics
```

**Gioi han trung thuc:** khong co audio trong import no-audio preview, nen AudioPlayer khong phat duoc; ASR/SER/QA model khong chay. Day la MVP UX/nghiep vu, chua phai demo end-to-end AI.

## E. Demo đầy đủ Calls/Audio/Review/Cases trên dữ liệu mẫu TÁCH BIỆT

Khi Windows đã mở được `localhost:5173`, nhưng FTISU operational DB đang có `calls=0`, không cần sửa tunnel hay bật AI. Để có đầy đủ màn hình, nút phát audio và dữ liệu cảm xúc **mô phỏng**, dùng lệnh khởi chạy **riêng, an toàn** sau.

**Trên FTISU:** Chỉ nhấn Ctrl+C ở cửa sổ `npm run remote:api-preview`, để nguyên cửa sổ GPU training và SSH tunnel. Trong cùng terminal FTISU, chạy:

```bash
cd ~/services/isemotalk
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
source ~/.local/share/isemotalk-node-env.sh
npm run remote:midterm-demo
```

Lệnh mới chỉ dùng Node + SQLite, không dùng GPU/Python. Nó tự tạo dữ liệu minh họa **trong `~/services/isemotalk-midterm-demo`**, không đặt vào `~/services/isemotalk-data`; khi chạy lại không xóa phần đã review và không tạo trùng bộ mẫu. Vẫn nghe API ở **cổng 3101**.

**Trên Windows:** Giữ SSH tunnel 13001→3101 và frontend 5173 như cũ, nhấn Ctrl+R trong trình duyệt. Tab Calls sẽ có dữ liệu mẫu. Chạy lại `npm run remote:mvp-check` nếu cần; kết quả phải báo `calls>0`. Trong banner có chữ **BẢN MẪU GIỮA KỲ** để không nhầm với kết quả thực.

Các dữ liệu cảm xúc và nhãn người nói ở bộ mẫu là mock. Audio được tạo bằng các sóng âm tổng hợp có waveform, **không có tiếng nói hay ASR thật**. Có thể dùng để kiểm tra thao tác audio player/timeline và review, nhưng không dùng số liệu model, độ chính xác hay thời gian suy luận từ dữ liệu này. Chưa có auto-calling, CRM hoặc đăng nhập nhiều reviewer.

Khi muốn trở lại database operational (không có bộ mẫu), dừng riêng terminal `remote:midterm-demo`, rồi:

```bash
cd ~/services/isemotalk
source ~/.local/share/isemotalk-node-env.sh
npm run remote:api-preview
```

Không chạy lệnh `seed:demo --reset` trên operational DB, không đổi biến `ISEMO_DATA_DIR` sang thư mục thật khi seed, và không xóa hai thư mục dữ liệu.

## E2. DEMO CÓ TIẾNG NÓI TỪ FILE DATASET GỐC (thay cho sóng âm demo)

Khi QA train xong, FTISU đã có các file:
- `~/services/isemotalk-private/datasets/onevoice`: 1.200 cuộc gọi TTS có lời thoại, nhãn QA của dataset (giả lập cuộc gọi, không phải khách hàng thật), CC BY-NC-SA 4.0.
- `~/services/isemotalk-private/datasets/fpt-fosd-sample`: 100 đoạn thu âm giọng người thật (FOSD train), CC BY 4.0.
- `~/services/isemotalk-private/datasets/fleurs-vi-test`: 120 đoạn thu âm tiếng Việt (FLEURS test), CC BY 4.0.

**Giữ nguyên bộ dữ liệu đã tải**, không download hay seed sóng giả. Lệnh dưới đây chép một số WAV nguồn vào một SQLite **riêng** (`~/services/isemotalk-speech-demo`). Trình phát nghe chính file WAV đó. Tệp nguồn giữ nguyên và hash SHA256 được ghi trong stage log. Transcript lấy trực tiếp từ dataset; ONE utterance đại diện toàn bộ recording (không phải ASR, không được xem là alignment đúng từng lượt). Không tự gán nhãn cảm xúc.

1. **FTISU:** Trong terminal đang chạy `remote:midterm-demo` hoặc `remote:api-preview`, bấm `Ctrl+C` **CHỈ với terminal API này**. ĐỪNG dừng mô hình hay xóa SQLite/dataset.
2. **FTISU** chạy:

```bash
cd ~/services/isemotalk
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
source ~/.local/share/isemotalk-node-env.sh
npm run remote:speech-demo
```

3. **Windows** giữ tunnel `13001 -> 3101`. Vì frontend code mới có cảnh báo nguồn dữ liệu, hãy dừng **chỉ frontend** ở 5173 (`Ctrl+C` trong Windows frontend terminal), sau đó:
```powershell
cd C:\Users\Legion\Documents\1203_KLTN
git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-vscode-preview.ps1 -LocalPort 13001
```
4. Nhấn Ctrl+R ở `http://127.0.0.1:5173`. Mở file có tên `TTS TỔNG HỢP · OneVoice` để nghe **lời thoại tổng đài bằng TTS**; mở file `GIỌNG THẬT · FPT FOSD` hoặc `GIỌNG THẬT · FLEURS` để nghe giọng người thực. Không có thêm transcript timeline theo câu, SER timeline, hoặc model prediction vì bước ASR/SER chưa chạy.
5. Kiểm tra `npm run remote:mvp-check` ở Windows sẽ thấy `ORIGINAL WAV SPEECH DATASET WORKSPACE`.

**Không nhầm ba khái niệm:**
- WAV lấy thật từ nguồn và phát đúng file ≠ âm thanh cuộc gọi CSKH người thật.
- OneVoice là WAV có lời nói nhưng TTS tổng hợp; FOSD/FLEURS là giọng người thật nhưng không phải cuộc gọi chăm sóc khách hàng.
- XLM-R seed 2026/2027/2028 train xong ≠ PhoWhisper ASR / F4 SER đã suy luận trên các tệp WAV.

Dữ liệu được dùng cho khóa luận phi thương mại; vẫn giữ attribution, giấy phép và revision dữ liệu nguồn. Không đưa file âm thanh lên public GitHub.

**Trở về SQLite operational**: `Ctrl+C` trong terminal `remote:speech-demo` rồi `npm run remote:api-preview` (và sau này `npm run remote:server` khi model verified). Dữ liệu operational trước đó vẫn tách biệt. Không xóa `isemotalk-midterm-demo` hay `isemotalk-speech-demo` để sửa lỗi.

## F. Sau khi GPU train xong: full model acceptance

- Xem ket qua seed2027/2028 + baselines, audit test splits. Dung `monitor-parallel.sh`; khong overwrite.
- `stage-gpu-models.sh` can private serving source, pinned PhoWhisper, emotion2vec, PhoBERT, M1/seed13 metadata/weight va tap verify hop le. Khong bo qua gate `ISEMO_ALLOW_UNVERIFIED=0`.
- Sau khi stop API preview, tren FTISU chay `npm run remote:preflight`, `npm run remote:server`. Kiem tra `npm run remote:check`, `npm run remote:qa-smoke`, `npm run remote:smoke -- /absolute/path/to/consented.wav`.
- Windows chuyen tu `remote:web:preview` sang `remote:web` **chi** khi real ASR, SER va QA deu ready/verified theo contract.
- Benchmark WER/CER cho ASR, macro-F1/UAR cho SER, va P@K/Recall@K cho QA tren tung bo du lieu co nhan; **khong** gop nhan / metric giua 3 bai toan.

## G. Noi dung chi nen bao cao giua ky o hien tai

Co the khang dinh: frontend QA + Calls/Review/Cases/Analytics co code va test; Node/Express+SQLite o FTISU chay; GPU QA XLM-R seed2026 hoan thanh tren OneVoice synthetic (test macro-F1 0.835, P@25 0.64) va baseline keyword/random da duoc xuat; cac seed tiep theo dang chay theo log; luong preview/model provenance duoc tach.

Khong khang dinh: F4 da serving raw WAV that, model SER dat accuracy tren tong dai that, PhoWhisper da duoc benchmark tren FLEURS, QA tang CSAT, he thong san sang production, hoac Windows browser da nghiem thu neu chua tu mo/thu thao tac.
