# ISEmoTalk — Demo workflow (02/11/2026)

## Purpose and scope
This branch wires the existing React interface to the Express + SQLite backend, reuses existing API endpoints and adds **real HTML audio playback** and **persistent utterance reviews**. It does **not** restore SER checkpoints or implement neural inference.

**Important honesty note:** Audio files from `npm run seed:demo` are artificially synthesized buzz/tone WAV files, **not recordings of spoken dialogue**. Their associated transcripts, speakers, emotion predictions, and confidences are mock data. This setup demonstrates the software workflow (audio position, review, persistence, analytics) and **must not be represented as accurate speech transcription or trained-model inference**.

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

This branch was authored by reviewing the GitHub source and API DTOs. **End-to-end browser execution and tests have not yet been performed in the user's Windows environment.** Before presenting, run `npm run build`, `npm run typecheck:server`, and `npm test` when feasible, then perform the reload-and-persistence demonstration. If errors occur, preserve any data and avoid destructive cleanup.

## Data safety

Changes reside in branch `feat/demo-sprint-api-20261102`, not `main`. No recordings, SQLite databases, checkpoints, or research dataset files were pushed by this change. Check the branch history before merging.
