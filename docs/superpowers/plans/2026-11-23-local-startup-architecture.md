# Local startup and architecture implementation plan

> **For agentic workers:** Use superpowers:executing-plans for root implementation with separate diagnostic ownership and one independent whole-change review.

**Goal:** Make local startup observable and repeatable, detect a stopped frontend, and document exactly how models participate in post-call QA and future deployment.

**Architecture:** Keep the existing three localhost services; use installed concurrently to supervise them from one foreground command. Treat model files, application data and process memory as distinct resources. No Rust rewrite or cloud deployment in this change.

**Tech Stack:** TypeScript/React, Node/Express/SQLite, Python/FastAPI, existing concurrently and Vite.

**Spec:** docs/superpowers/specs/2026-11-23-local-startup-architecture-design.md

## Constraints

Existing clean isolated checkout on PR6 branch at68891da. Preserve ignored environment/data/cache files. Use Node22+, ports5173/3001/8001 and local shared uploads. No model downloads or fabricated metrics. No full browser/native-Windows claim from HTTP tests.

## Review focus

- Build exists/API up but frontend dead must fail readiness.
- A different service or stale HTML on5173 must not count as the app.
- Occupied port must not cause takeover/kill or migration to an unexpected port.
- One child exits after startup: remaining children must stop and error must name the component.
- Environment overrides must not point API and Python to different uploaded files or silently route a local demo to a remote worker.

## Task1 — readiness and interpreter diagnostics

Owner: startup agent. Files scripts/check-demo.mjs, scripts/run-python.mjs, scripts/python-runtime.mjs; focused server/tests/local-readiness.test.ts and python-runtime.test.ts.

Interface: export resolvePythonExecutable(projectRoot, env=process.env, platform=process.platform) from scripts/python-runtime.mjs; return absolute executable or throw an actionable Error. Root launcher imports this. check-demo adds ISEMO_WEB_URL defaulthttp://127.0.0.1:5173; keep existing API/inference flags.

- [x] Add failing CLI regression for webdown despite healthy API/inference; actual loopback HTTP fixtures and subprocess exit assertions.
- [x] Implement independent endpoint/build/asset/proxy checks with bounded timeouts and useful errors.
- [x] Test absolute/default Python selection and controlled relative/missing override errors; add actual child exit logging without changing model settings.
- [x] Run focused and full Node tests; release files for integration.

## Task2 — one-command demo launcher

Owner: root. Files scripts/start-demo.mjs, scripts/demo-runtime.mjs, package.json; server/tests/demo-startup.test.ts; CI workflow.

Interface: checkDemoPrerequisites(projectRoot, env=process.env) returns {python,dataDir,uploadsDir,childEnv}; assertLoopbackPortsAvailable(ports) opens/closes temporary loopback listeners. Runtime uses existing npm scripts through concurrently with killOthers on success/failure, killTimeout15000, cwdprojectRoot.

- [x] Write tests for occupied port, missing build/Python, incompatible endpoint overrides and shared upload resolution.
- [x] Implement minimal prerequisites and supervisor; add npm run demo.
- [x] Smoke real3services in one namespace with temp data; stop a required component and verify sibling cleanup and failing exit.
- [x] Configure Node22 CI for Windows script behavior; actual run results are linked from PR6. Avoid claiming Windows interactive signal equivalence.

## Task3 — business architecture and delivery

Owner: root. Files docs/BUSINESS_ARCHITECTURE.md, docs/DEMO_RUNBOOK.md, README.md, docs/audits/startup-20261123.md.

- [x] Map current actors, IDs, model responsibility, process and paths from actual source. Include local/remote diagrams and explicit gaps.
- [x] Explain Rust/native inference and model-memory/hosting tradeoffs with official sources. Define one active genuine model and versioned run acceptance gates.
- [x] Document external WindowsTerminal/PowerShell launch, no activation requirement, exit/listener diagnosis and preflight output requested from user.
- [x] Final local Node tests/build/typecheck and independent review with one verified fix pass; original Windows termination trigger remains explicit. Publication and CI results are tracked on PR6.

## Independent-review fix pass

- [x] Reproduce19s hang with TERM-resistant service holding a real listener; use POSIX exec so escalation retains its target; verify bounded launcher exit, correct component name and closed listener.
- [x] Reproduce false-positive alteredHTML/substitutedJS under matching filenames; compare actual bytes.
- [x] Reproduce missing build-origin evidence using a real Vite build with custom API URL; emit buildmetadata and reject incompatible localdemo builds while preserving deployment overrides.
- [x] Reproduce degraded webproxy with healthy directAPI; fail that proxy path explicitly.
- [x] Correct Windows forced-stop semantics and scope model-download statement to preflight/cache-only warmup. Optional adapter jobs resume using their own configured loading policy.

The testbuild explicitly selects vite.config.ts because tsc may leave an ignored generated vite.config.js in a developer checkout. Final local evidence:178 tests,16files; build/typecheck pass; real mock-service HTTP smoke passes. Hosted Node22/Windows outcomes are recorded on PR6 after publication.
