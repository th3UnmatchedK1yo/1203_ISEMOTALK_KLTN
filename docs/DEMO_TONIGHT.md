# ISEmoTalk — Demo workflow (02/11/2026)

## Purpose and scope
This branch wires the existing React interface to the Express + SQLite backend, reuses existing API endpoints and adds **real HTML audio playback** and **persistent utterance reviews**. It does **not** restore SER checkpoints or implement neural inference.

**Important honesty note:** Audio files from `npm run seed:demo` are artificially synthesized buzz/tone WAV files, **not recordings of spoken dialogue**. Their associated transcripts, speakers, emotion predictions, and confidences are mock data. This setup demonstrates the software workflow (audio position, review, persistence, analytics) and **must not be represented as accurate speech transcription or trained-model inference**.

## FIX 02/11/2026: API responds but React is blank

Root cause: the previous React client silently converted a non-JSON response into `null`. When an already-running Vite instance returned its HTML `index.html` for `/api/*` (e.g. because the new proxy config had not loaded), the Calls table remained blank and Analytics displayed endless loading.

**Fix:** In Vite development mode, the API client now calls `http://127.0.0.1:3001` directly (the Express backend already enables CORS). The audio player uses the same origin. Non-JSON and malformed responses now show a meaningful error. Set `VITE_API_BASE_URL` only if you intentionally use a different API location. Production builds continue to use same-origin `/api` by default.

**Local update from the old demo branch:**

```powershell
git status
git fetch origin
git switch feat/demo-sprint-api-20261102
git pull --ff-only origin feat/demo-sprint-api-20261102
```

If `git status` shows local uncommitted changes and switch/pull refuses, preserve them and resolve the conflict first; do not run `git reset --hard` or `git clean`.

Start the API and frontend in two terminals (see commands below) and open:
- `http://127.0.0.1:3001/api/calls` — JSON with 13 calls in the user's original local DB
- `http://127.0.0.1:3001/api/analytics` — JSON with 102 utterances in the user's original local DB
- `http://localhost:5173/calls` — populated table
- `http://localhost:5173/analytics` — visible statistics

The API now automatically seeds **only a completely empty development database** (unless `ISEMO_AUTO_SEED=0`). Existing calls, recordings, corrections and review decisions are never overwritten or duplicated by this startup behavior.

If the browser still shows the previous code, stop and restart the Vite dev server, then hard-refresh with Ctrl+Shift+R.

## Run on Windows PowerShell

From the project root, using the **existing installed dependencies**:

```powershell
npm run seed:demo
npm run dev:api
```

Open a **second PowerShell terminal** in the same directory:

```powershell
npm run dev:web
```

Frontend: <http://localhost:5173/calls>  
Backend: <http://127.0.0.1:3001/api/calls>  
Analytics: <http://localhost:5173/analytics>

The Vite development proxy forwards `/api` to port 3001.

If dependencies are missing, check disk capacity **before** running `npm ci`. Do not install PyTorch or download HuggingFace models for the seeded-call demo.

**No Python FastAPI service is required to browse and review already seeded calls.** FastAPI is required only for *new* upload/inference processing. Avoid `npm run dev` if the inference venv is missing; start the web and API processes separately as shown.

Do not run `npm run seed:demo -- --reset` before the demonstration, because it can delete mock records and their review data. Normal `npm run seed:demo` is idempotent when mock records are already present.

## Recommended demo route

1. Visit `/calls` and verify the table contains the saved SQLite calls (there should be up to 13 in the original local database; a fresh seed also generates demo calls).
2. Open a ready call with audio, ideally the first seeded showcase entry titled **Đơn hàng #45892 chưa giao**. Avoid assuming a fixed ID if the database already contains records.
3. On the Call Review page, play the embedded WAV; the playhead and highlighted utterance follow the actual audio element. Clicking an utterance seeks to its start.
4. Select a customer utterance and inspect acoustic, lexical, fused predictions. In the seeded demo these are **mock** labels.
5. Choose a different emotion in *Sửa nhãn cảm xúc*, add a note, then click **Lưu vào SQLite**.
6. Reload the browser and verify the correction/note remains. You may mark **Đã hoàn tất xem xét** and save to change review status.
7. Open `/analytics` to view actual SQLite-backed aggregate counts and the emotion distribution (including any saved human corrections).

## API contract used

- `GET /api/calls` — paginated list and filters.
- `GET /api/calls/:id` — detail with utterances, moments and `version`.
- `GET /api/calls/:id/audio` — byte-range WAV streaming.
- `PUT /api/calls/:id/review` — transactional, versioned human review.
- `GET /api/analytics` — server-computed operational statistics.

Review conflicts (HTTP 409) are shown to the user, not silently overwritten.

## What is intentionally unfinished

- Real SER/ASR model checkpoint integration.
- Upload UI and new-processing progress UI.
- Real human speech playback in seeded demo data.
- Authentication and cloud hosting.

## Verification status

GitHub Actions includes a frontend build, backend typecheck and existing backend test checks for this demo branch. Check the latest CI run before merging. Actual audio playback and save/reload behavior must still be verified locally because the local SQLite data and synthetic WAV files are not committed.



This branch was authored by reviewing the GitHub source and API DTOs. **End-to-end browser execution and tests have not yet been performed in the user's Windows environment.** Before presenting, run `npm run build`, `npm run typecheck:server`, and `npm test` when feasible, then perform the reload-and-persistence demonstration. If errors occur, preserve any data and avoid destructive cleanup.

## Data safety

Changes reside in branch `feat/demo-sprint-api-20261102`, not `main`. No recordings, SQLite databases, checkpoints, or research dataset files were pushed by this change. Check the branch history before merging.
