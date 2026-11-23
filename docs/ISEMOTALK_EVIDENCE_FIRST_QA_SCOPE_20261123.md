# ISEmoTalk: Product scope and evidence-first post-call QA

Date: 2026-11-23. This is a **product specification**, not a claim that features
listed under "Target" are already implemented or validated. The current SER
research and the contact-center application are related but distinct.

## What production conversation-intelligence products actually analyze

- **Transcription and interaction coverage**: automatic ASR, indexed calls,
  speaker/channel handling, audit trail and privacy controls.
- **Reason for contact**: intent, topic, repeated requests, product problems.
- **Service process**: greeting, verification, script/policy compliance,
  promises/callback obligations and risks.
- **Outcome**: resolved, unresolved, escalation, repeat contact, next steps.
  CRM disposition and company policy often matter; transcript alone can be insufficient.
- **Agent behaviors**: clear instructions, empathy, interruption,
  response adequacy, coaching signals.
- **Customer experience**: sentiment/emotion *alongside* content, acoustic
  stress/agitation, change during the call, and perceived effort.
- **Evidence and action**: timestamped transcript excerpts backing
  findings, manual review, case tracking, QA calibration.

Public references:
- Observe.AI, Auto QA: https://www.observe.ai/post-interaction/auto-qa
- Observe.AI, Interaction Intelligence: https://www.observe.ai/platform/interaction-intelligence
- CallMiner, Conversation Analytics: https://callminer.com/conversation-analytics/conversation-analytics
- CallMiner, Sentiment Analysis: https://callminer.com/conversation-analytics/sentiment-analysis
- NiCE, Evaluating an Interaction: https://help.nicecxone.com/content/qmanalytics/evaluate/evaluatinganinteraction.htm
- NiCE, Sentiment & emotion cautions: https://www.nice.com/faq/ai-customer-service-agentic-ai-faqs/what-is-sentiment-analysis-in-customer-service

## Current implementation, truth-in-labeling

1. Upload and raw audio preservation: implemented.
2. Real Vietnamese ASR: PhoWhisper-base on FTISU CUDA. Upgrade to
   medium/large may be staged explicitly; cannot claim accuracy on real calls.
3. ASR timestamp segmentation: word-aligned when valid; fallback uses true
   audio-input windows and explicitly declares coarse timing. Neither is
   automatic speaker-role identification.
4. XLM-R QA: a **binary needs_attention/routine classifier** trained from
   synthetic OneVoice labels. Inference uses max probability over text windows,
   so the score is NOT calibrated full-call risk or an agent QA grade.
5. Diarization: currently disabled. OneVoice reference transcripts may
   include role/script labels, but a new WAV's roles stay UNKNOWN without
   channel separation or verified diarization + role mapping.
6. F4 acoustic-lexical SER: not served/verified in this web runtime.
   Never display synthetic colors/percentages as if this model ran.
7. Reviewer actions/cases: present; these are human decisions, not model truth.

## Target workflow

Audio -> verified ASR + transcript provenance -> diarization/role evidence ->
intent/topic & procedure/outcome criteria -> timestamped evidence ->
SER acoustic-lexical evidence where verified -> prioritized cases ->
reviewer confirmation -> follow-up + aggregate analytics.

**ASR confidence/gaps and speaker uncertainty must propagate.** If a
criterion requires CRM records, business policy or external facts, the answer
is "insufficient evidence," not a guessed failure or success.

## Illustrative rubric, NOT automatic score currently produced

The following is a proposed *human-evaluated* 100-point scorecard to calibrate
with a real organization. These are design weights, NOT values from the cited
vendors and NOT outputs of the current classifier.

| Criterion | Example weight | Evidence needed |
| --- | ---: | --- |
| Correctly understood the customer's issue | 15 | Customer request and agent paraphrase |
| Accurate and appropriate instructions | 25 | Transcript plus authoritative service policy |
| Compliance and required verification | 20 | Relevant procedural checklist and call excerpts |
| Resolution and actionable next steps | 25 | Commitment, outcome, CRM disposition when available |
| Respectful communication and clarity | 15 | Interaction content, voice evidence where validated |

For each criterion return PASS / FAIL / NOT ASSESSABLE, grounded supporting
segments and source (ASR, channel, CRM, policy). No invented evidence;
missing criteria should not be silently scored as zero.

**Emotion is an independent risk/context layer, not agent fault.** A
customer angry about a failed product can receive excellent support. A calm
customer can be given incorrect regulatory advice. Neither content alone
nor acoustic emotion alone is a full QA verdict.

## Scientific positioning of SER contribution

Research question: Does audio emotion add **incremental predictive value**
beyond transcript-only QA triage when prioritizing human review?

Compare, on **consented and human-labeled real Vietnamese call data**:
- Baseline A: content/intent/outcome features (text only).
- Baseline B: acoustic SER/tension features (audio only).
- Baseline C: fusion or stacked triage of text and SER features.

Freeze speaker-disjoint train/test splits; report ASR WER/CER, speaker
assignment error, target-label distributions, model confidence/calibration,
precision@K / recall@K at a fixed QA review budget and error analysis. Prefer
matched annotations for unresolved issues, escalation, complaint severity
and policy compliance; do not substitute synthetic OneVoice labels for
ground-truth human QA ratings.

If SER adds no reliable performance on genuine call recordings, report
this honestly and frame it as an analysis of where acoustic-lexical
information transfers or fails. Do not train to fabricate usefulness.

## Release gates

- [ ] 6/6 sample WAVs complete ASR without a timestamp-only failure.
- [ ] Compare base vs medium on the same 6 reference transcripts using
      normalized Vietnamese WER/CER. Do not quote source-benchmark WER as
      measured ISEmoTalk accuracy.
- [ ] Disambiguate two speakers with verified channel/diarization evidence,
      or explicitly show UNKNOWN. User edits are review corrections.
- [ ] Show which QA predictions are raw text triage vs which are human
      quality scores; provenance and window coverage visible.
- [ ] Introduce timestamped QA evidence excerpts and a documented rubric.
- [ ] Validate SER F4 serving and test domain shift before showing emotions.
- [ ] Demonstrate batch processing reliability with throughput, queue,
      retries, resource consumption and review-budget metrics.

All test source data and checkpoints stay on FTISU under private folders.
Never commit real calls, credentials, audio or checkpoint weights to GitHub.
