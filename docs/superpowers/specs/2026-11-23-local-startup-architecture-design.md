# Local startup and business architecture design — 2026-11-23

## Intent and evidence

The user cannot open127.0.0.1:5173 after a successful build and wants the business process, model location, stack, Rust tradeoff and hosting plan made explicit before more feature work. Screenshots show all foreground commands returned to PowerShell; they do not establish what terminated them.

Read-only reproduction on68891da starts the exact3 commands, serves HTML/assets/API/inference and remains alive. Stopping preview reproduces connection refused while the old demo:check incorrectly exits0. The confirmed code defect is incomplete diagnostics; the original termination trigger on Windows remains unknown.

## Approach chosen for this repair

1. **Keep existing React/Node/Python and supervise local startup** — selected by the implementer under the user's request to investigate and fix. Add one foreground demo command, fail-fast prerequisites and frontend/proxy checks. Preserve existing environments, model settings and stored data.
2. **Rewrite the API/inference in Rust** — defer pending measured bottleneck or a separate deployment requirement; it does not fix an absent listener or supply missing research encoders.
3. **Move immediately to a VPS/GPU worker** — defer until genuine model resource measurements and a transport contract exist. Current API sends local paths, not file bytes/object references.

No paid resource, public deployment, new model download, broad UI redesign or new business feature is authorized by this implementation decision. Existing post-call QA scope remains the accepted base; this repair and its documentation proceed without an additional permission gate.

## Runtime behavior

- npm run demo invokes a small Node entrypoint using the installed concurrently supervisor, rather than a custom Windows process-tree killer.
- Validate Node22+, dist/index.html, selected Python executable and free loopback ports5173/3001/8001 before starting. No killing an existing port owner.
- The local launcher supports the existing fixed ports and local co-located inference; reject incompatible PORT/INFERENCE_URL settings with an explanation. Use one shared uploads location for Node and Python, without editing.env.
- Keep model selections/cache unchanged; default automatic seed off for this launcher. Show that its terminal must stay open.
- Start the existing production-style commands; prefix component logs; any required service exit stops siblings and reports exit information. Configure15seconds before the POSIX force-kill fallback. Ruling: the existing Windows tree-kill backend uses taskkill /T /F; retain that supported behavior and document that it does not guarantee graceful drain. Do not claim terminal closure or force-kill can be made harmless.
- Python wrapper prints selected interpreter/PID/exit code/signal; explicitly reject relative ISEMO_PYTHON overrides to remove cwd ambiguity.
- demo:check must independently check built HTML, served frontend and referenced JS asset, /api status through the web proxy, direct API and inference. One failed service cannot suppress diagnostics for the others. Missing build/web/asset/proxy produces nonzero exit. No weights downloaded.
- --warmup-asr retains cache-only semantics; --require-real-ser retains the stricter real/verified condition. Availability and model authenticity are reported separately.

### Rulings after independent review

- Preserve a live POSIX signal target by exec-ing the existing foreground script body, rather than adding disposable npm/shell wrappers. The known demo scripts are simple node/vite commands; complex shell-script overrides must run separately. Keep the supported Windows process-tree backend.
- Verify served HTML and JavaScript byte digests against dist, not only markers/filenames. This is build identity, not browser interaction acceptance.
- Emit dist/demo-build.json from Vite's resolved environment and require same-origin API for supervised local demo/check. A shell-variable check cannot detect a previously built incompatible API URL. Deployment overrides outside the local launcher remain supported.
- Require inference reachability through the browser's proxy as well as the direct API path.

## Business/deployment document

Provide an actual-code responsibility map and a post-call process with actors, IDs, data, state transitions and acceptance criteria. Distinguish model files, venv packages, loaded Python process and RAM/VRAM; distinguish inference, training and research variants. Describe local, one-host, and separated-worker options with clear current/proposed labels. Preserve F1/B2/F4 lineage and the missing authentic F4 feature/factory boundary.

Current remote-blocking fact: Pipeline resolves absolute local uploads paths; Python restricts them to its local uploads_dir. A remote URL alone cannot transport audio. A future remote API needs asset/run identity, bytes/object storage, authentication and job ownership; these are not implemented by this repair.

## Acceptance

- Reproduce old false-positive check with web stopped, then fail correctly after fix.
- Verify healthy HTML/assets/proxy path passes; missing asset/proxy/API/inference are distinguished.
- Verify launcher refuses occupied port and missing interpreter/build, leaves other services alone, and propagates child startup failure.
- Real mock-service smoke with fresh data: one command starts all3, frontend/proxy respond, required child failure stops siblings.
- Existing Node suite/build/server typecheck remain green. Windows CI covers portable script behavior, with native interactive Ctrl+C still a laptop check.
- Independent review; publish update to existing draft PR6 so the user can pull the same branch. Do not merge.
