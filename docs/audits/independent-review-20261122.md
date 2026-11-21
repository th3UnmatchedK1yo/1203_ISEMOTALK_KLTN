# Independent review — 2026-11-22

Reviewed the current branch against `9f7ced37d7ddbf253bc7946c111662bc8732e785`. The reviewer had fresh, task-specific context and read-only access; made no edits or commits. This file is the coordinator's record of that review, not a GitHub approval or a second full-suite execution.

## Disposition

**Suitable for a draft PR after coordinated verification.** Three Important findings were identified and fixed. No outstanding Critical or Important finding was reported within the agreed localhost demonstration scope. Root subsequently ran the final Node suite (123/123), Python suite (34/34), frontend build and backend typecheck successfully.

## Findings resolved

| Finding | Reproduction | Correction and independent recheck |
|---|---|---|
| Checkpoint replacement between full hash validation and fingerprint capture | Replaced weights could load while health remained verified | Capture identity before hashes and compare after validation and loading. Same race now rejects before factory load; model absent and verified false |
| An unresolved older workflow draft could be overwritten by edits based on a newer server version | Version-1 draft followed by editing version-2 form replaced the same storage key | Block edit/save/persistence while stale; explicit confirmed discard; storage helper rejects cross-version replacement. Independent check retained the original note |
| Transition moment playback and editor targeted different utterances | Playback sought current turn at10s, while editor selected previous turn0–5s | Select actual supporting utterance at playback anchor; preserve sustained-run behavior. Original fixture now selects the current turn |

Additional fixes from review: show bounded row-level import error details; warn when workflow draft storage is unavailable, provide download and guard link navigation. Complete workflow history is included in JSON export while the interactive panel returns50 events.

## Strengths noted

Durable IDs, cancellation before deletion, atomic stage checkpoints, shutdown drain, independently versioned workflow, original inputs retained beside QA decisions, unknown-role honesty, explicit mock/imported provenance, bounded decoding and model initialization, and documentation that separates software correctness from scientific and deployment validity.

## Retained limits and rulings

- **Per-run package digest:** currently stage evidence contains adapter/model/device/mock/verified, not enough to distinguish two checkpoint seeds served by the same factory. Required before genuine SER acceptance; recorded in the restoration roadmap.
- **Storage unavailable + browser Back/Forward:** link-click guard cannot cancel browser history navigation. Visible warning and runbook require saving/downloading first; router-level blocking is deferred.
- **Rendered UI/native audio:** no browser screenshot or native playback verification available here. Desktop/narrow layout, two-tab interaction and audio/seek remain laptop acceptance items.
- **Research accuracy/reproduction:** no genuine end-to-end model executed; tests do not establish paper metrics or call-center accuracy.
- **Private archive authenticity:** independently verified by the research audit, not re-hashed by this reviewer. Do not imply every reviewer repeated that work.
- **Laptop performance:** requires intended Windows hardware and real models; not inferred from container tests.
- **Production auth, PBX/CRM, multi-user distributed jobs:** outside this local demonstration scope; retained as roadmap gates.
- **Undeclared factory dependencies:** package verification checks declared assets; completeness of private research dependencies remains the package author's responsibility.

These are explicit boundaries, not silently waived features. See [verification evidence](verification-20261122.json) and [laptop runbook](../DEMO_RUNBOOK.md).
