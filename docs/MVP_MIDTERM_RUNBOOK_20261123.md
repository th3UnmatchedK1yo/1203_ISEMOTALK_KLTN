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

## E. Tuy chon: demo AudioPlayer bang bo mau HOAN TOAN tach biet

Chi neu can minh hoa audio UI trong khi GPU dang train. **Khong seed vao FTISU DB that o 3101.** Cach ly du lieu mau trong `~/services/isemotalk-midterm-demo`; audio la song am tong hop, **khong phai loi noi**.

FTISU terminal rieng:

```bash
cd ~/services/isemotalk
source ~/.local/share/isemotalk-node-env.sh
ISEMO_DATA_DIR="$HOME/services/isemotalk-midterm-demo" node --import tsx server/src/seed-cli.ts
PORT=3102 ISEMO_DATA_DIR="$HOME/services/isemotalk-midterm-demo" npm run remote:api-preview
```

Windows tao MOT tunnel **khac** local 13002 -> FTISU 3102, tuong tu muc A; su dung `-LocalPort 13002` khi bat frontend, va dung frontend 5173 cu truoc. Bo mau `provenance=mock`; **khong** bao cao la du doan tu model F4 hay am thanh speech. Khong chiem 3101/3001 va khong can GPU. Khong bat buoc de hoan thanh MVP nghiep vu.

## F. Sau khi GPU train xong: full model acceptance

- Xem ket qua seed2027/2028 + baselines, audit test splits. Dung `monitor-parallel.sh`; khong overwrite.
- `stage-gpu-models.sh` can private serving source, pinned PhoWhisper, emotion2vec, PhoBERT, M1/seed13 metadata/weight va tap verify hop le. Khong bo qua gate `ISEMO_ALLOW_UNVERIFIED=0`.
- Sau khi stop API preview, tren FTISU chay `npm run remote:preflight`, `npm run remote:server`. Kiem tra `npm run remote:check`, `npm run remote:qa-smoke`, `npm run remote:smoke -- /absolute/path/to/consented.wav`.
- Windows chuyen tu `remote:web:preview` sang `remote:web` **chi** khi real ASR, SER va QA deu ready/verified theo contract.
- Benchmark WER/CER cho ASR, macro-F1/UAR cho SER, va P@K/Recall@K cho QA tren tung bo du lieu co nhan; **khong** gop nhan / metric giua 3 bai toan.

## G. Noi dung chi nen bao cao giua ky o hien tai

Co the khang dinh: frontend QA + Calls/Review/Cases/Analytics co code va test; Node/Express+SQLite o FTISU chay; GPU QA XLM-R seed2026 hoan thanh tren OneVoice synthetic (test macro-F1 0.835, P@25 0.64) va baseline keyword/random da duoc xuat; cac seed tiep theo dang chay theo log; luong preview/model provenance duoc tach.

Khong khang dinh: F4 da serving raw WAV that, model SER dat accuracy tren tong dai that, PhoWhisper da duoc benchmark tren FLEURS, QA tang CSAT, he thong san sang production, hoac Windows browser da nghiem thu neu chua tu mo/thu thao tac.
