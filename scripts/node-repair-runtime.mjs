import path from 'node:path'
import { spawn } from 'node:child_process'

const demoPorts = new Set([5173, 3001, 8001])
const nodeEntrypoints = [
  'node_modules/vite/bin/vite.js',
  'node_modules/tsx/dist/cli.mjs',
  'node_modules/tsx/dist/cli.cjs',
  'node_modules/concurrently/dist/bin/concurrently.js',
  'scripts/start-demo.mjs',
  'scripts/run-python.mjs',
  'server/src/index.ts',
]
// These are the Windows esbuild packages present in this project's lockfile.
// Match full paths, never a repository-name prefix or an arbitrary esbuild.exe.
const esbuildEntrypoints = ['node_modules', 'node_modules/tsx/node_modules'].flatMap(directory =>
  ['x64', 'arm64', 'ia32'].map(architecture => `${directory}/@esbuild/win32-${architecture}/esbuild.exe`))
const nodeValueOptions = new Set([
  '--import', '--require', '-r', '--loader', '--experimental-loader',
  '--conditions', '-C', '--title',
])
const nodeFlagOptions = new Set(['--enable-source-maps', '--no-warnings', '--trace-warnings'])

export class NodeRepairError extends Error {
  constructor(message, exitCode = 2) {
    super(message)
    this.name = 'NodeRepairError'
    this.exitCode = exitCode
  }
}

function windowsPath(value) {
  return typeof value === 'string' && path.win32.isAbsolute(value)
    ? path.win32.normalize(value).toLowerCase() : null
}

function commandTokens(value) {
  // Accept only whole quoted or whole unquoted arguments. Windows can join
  // quoted and unquoted fragments, and escaped quotes have additional rules;
  // refuse those forms rather than infer ownership from a partial argument.
  if (typeof value !== 'string' || /[\r\n\0]/.test(value)) return null
  const tokens = []
  let index = 0
  while (index < value.length) {
    if (/[ \t]/.test(value[index])) { index++; continue }
    if (value[index] === '"') {
      const end = value.indexOf('"', index + 1)
      if (end === -1 || value[end - 1] === '\\' || (end + 1 < value.length && !/[ \t]/.test(value[end + 1]))) return null
      tokens.push(value.slice(index + 1, end))
      index = end + 1
    } else {
      let end = index
      while (end < value.length && !/[ \t]/.test(value[end])) end++
      const token = value.slice(index, end)
      if (token.includes('"')) return null
      tokens.push(token)
      index = end
    }
  }
  return tokens.length && tokens[0] ? tokens : null
}

function nodeEntrypoint(tokens) {
  if (!tokens) return null
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index]
    if (token === '--') return tokens[index + 1] ?? null
    if (!token.startsWith('-')) return token
    if (nodeValueOptions.has(token)) {
      if (!tokens[index + 1] || tokens[index + 1].startsWith('-')) return null
      index++
      continue
    }
    const equals = token.indexOf('=')
    if (equals > 0 && nodeValueOptions.has(token.slice(0, equals)) && token.slice(equals + 1)) continue
    if (nodeFlagOptions.has(token)) continue
    // Unknown options may consume an operand. Never guess that the operand is
    // the main script (for example: --title <project-path> <unrelated-script>).
    return null
  }
  return null
}

export function classifyProjectProcess(processInfo, projectRoot) {
  if (!Number.isInteger(processInfo.pid) || processInfo.pid <= 0) return null
  const project = windowsPath(projectRoot)
  if (!project) throw new NodeRepairError('Project root must be an absolute Windows path.')
  const executable = windowsPath(processInfo.executablePath)
  const name = (processInfo.name ?? '').toLowerCase()
  const tokens = commandTokens(processInfo.commandLine)
  if (name === 'esbuild.exe' && esbuildEntrypoints.some(relative => executable === path.win32.join(project, relative))) {
    return 'project esbuild executable'
  }
  if (name === 'node.exe' && executable && path.win32.basename(executable) === 'node.exe') {
    const entry = windowsPath(nodeEntrypoint(tokens))
    const known = nodeEntrypoints.find(relative => entry === path.win32.join(project, relative))
    if (known) return `project ${known}`
  }
  if ((name === 'python.exe' || name === 'pythonw.exe') && executable && tokens &&
      executable === path.win32.join(project, `inference/.venv/scripts/${name}`) &&
      tokens[1] === '-m' && tokens[2] === 'uvicorn' && tokens[3] === 'app.main:app') {
    return 'project inference venv running app.main:app'
  }
  return null
}

export function inspectRepairState(inventory, projectRoot) {
  if (!inventory || !Array.isArray(inventory.processes) || !Array.isArray(inventory.listeners)) {
    throw new NodeRepairError('Windows process/listener inventory is incomplete. No installation was started.')
  }
  const owned = inventory.processes.filter(item => classifyProjectProcess(item, projectRoot))
  const ownedPids = new Set(owned.map(item => item.pid))
  const listeners = inventory.listeners.filter(item => demoPorts.has(item.port))
  const unknownListeners = listeners.filter(item => !ownedPids.has(item.pid))
  return { owned, listeners, unknownListeners }
}

function hasActivity(state) {
  return state.owned.length > 0 || state.listeners.length > 0
}

function reportActivity(state, log) {
  for (const item of state.owned) log(`Project process: PID ${item.pid}, ${item.name}`)
  for (const item of state.listeners) log(`Listening: port ${item.port}, PID ${item.pid}`)
}

function rejectUnknownListeners(state) {
  if (state.unknownListeners.length > 0) {
    const locations = state.unknownListeners.map(item => `port ${item.port}, PID ${item.pid}`).join('; ')
    throw new NodeRepairError(`Cannot prove project ownership: ${locations}. Nothing was stopped. Use Ctrl+C in the terminal running that service, then retry. Port numbers alone never authorize stopping a process.`)
  }
}

export async function repairNodeDependencies(options, operations) {
  const { projectRoot, checkOnly = false, stopProjectProcesses = false } = options
  if (checkOnly && stopProjectProcesses) throw new NodeRepairError('-CheckOnly cannot be combined with -StopProjectProcesses.')
  const { inventory, stop, runNpm, pause, log } = operations
  let state = inspectRepairState(await inventory(), projectRoot)
  reportActivity(state, log)
  rejectUnknownListeners(state)
  if (hasActivity(state) && !stopProjectProcesses) {
    throw new NodeRepairError('Project processes are still active. Use Ctrl+C in the demo/dev terminals, then retry. Alternatively, -StopProjectProcesses can stop only verified project processes. npm ci was not started.')
  }
  if (checkOnly) {
    log('Preflight clear. CheckOnly: no process stopped, no dependencies installed, no build run.')
    return
  }
  if (state.owned.length > 0) {
    await stop(state.owned)
    for (let attempt = 0; attempt < 6; attempt++) {
      state = inspectRepairState(await inventory(), projectRoot)
      if (!hasActivity(state)) break
      await pause(500)
    }
    if (hasActivity(state)) {
      reportActivity(state, log)
      throw new NodeRepairError('Project services are still active or restarted. Use Ctrl+C in the supervising terminal. npm ci was not started.')
    }
  }
  // A final scan also catches a watcher started while the user read the first scan.
  state = inspectRepairState(await inventory(), projectRoot)
  if (hasActivity(state)) {
    reportActivity(state, log)
    throw new NodeRepairError('A service became active during preflight. npm ci was not started. Stop it and retry.')
  }
  log('Preflight clear. Keep the demo/dev terminals stopped until this command finishes.')
  log('Repairing Node dependencies with npm.cmd ci; then building the web application.')
  const installCode = await runNpm(['ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund'])
  if (installCode !== 0) {
    throw new NodeRepairError(`npm ci failed (exit ${installCode}). Build was not run. If EPERM persists, another file lock or permission issue needs investigation; do not delete the database, venv, uploads, or model cache.`, installCode || 1)
  }
  const buildCode = await runNpm(['run', 'build'])
  if (buildCode !== 0) throw new NodeRepairError(`npm run build failed (exit ${buildCode}). Read the build error above before starting the demo.`, buildCode || 1)
  log('Node dependencies installed and web build completed. Next: npm run demo, then npm run demo:warmup in another terminal.')
}

function runPowerShell(script, env = {}) {
  const executable = process.env.SystemRoot
    ? path.win32.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe') : 'powershell.exe'
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => { child.kill(); reject(new NodeRepairError('Windows process inspection timed out. No installation was started.')) }, 15_000)
    child.stdout.on('data', data => { stdout += data.toString() })
    child.stderr.on('data', data => { stderr += data.toString() })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code !== 0) reject(new NodeRepairError(`Windows process inspection/stop failed (exit ${code}). ${stderr.trim()}`))
      else resolve(stdout.replace(/^\uFEFF/, '').trim())
    })
  })
}

export async function readWindowsInventory() {
  const output = await runPowerShell(`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$processRows = @(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object {
  [ordered]@{
    pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; name = [string]$_.Name
    executablePath = [string]$_.ExecutablePath; commandLine = [string]$_.CommandLine
    createdAt = $(if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { '' })
  }
})
$listenerRows = @(Get-NetTCPConnection -State Listen -ErrorAction Stop |
  Where-Object { $_.LocalPort -in @(5173, 3001, 8001) } |
  ForEach-Object { [ordered]@{ port = [int]$_.LocalPort; pid = [int]$_.OwningProcess } })
[ordered]@{ processes = $processRows; listeners = $listenerRows } | ConvertTo-Json -Depth 4 -Compress
`)
  try { return JSON.parse(output) } catch { throw new NodeRepairError('Could not parse Windows process/listener inventory. No installation was started.') }
}

export async function stopWindowsProjectProcesses(processes, projectRoot) {
  for (const item of processes) {
    if (!classifyProjectProcess(item, projectRoot) || !item.createdAt || !item.executablePath) {
      throw new NodeRepairError(`Cannot verify process identity for PID ${item.pid}. Use Ctrl+C in its terminal instead.`)
    }
  }
  // JSON travels through an environment variable, never interpolated shell code.
  // Recheck every identity before stopping any process. Capture the Process
  // handle and check its creation time as well, avoiding a recycled PID target.
  await runPowerShell(`
$ErrorActionPreference = 'Stop'
$targets = ConvertFrom-Json -InputObject $env:ISEMO_REPAIR_TARGETS
$handles = New-Object System.Collections.Generic.List[System.Diagnostics.Process]
try {
  foreach ($target in $targets) {
    $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$target.pid) -ErrorAction Stop
    if (-not $current) { continue }
    if ($current.CreationDate.ToUniversalTime().ToString('o') -cne $target.createdAt -or
        [string]$current.ExecutablePath -ine [string]$target.executablePath -or
        [string]$current.CommandLine -cne [string]$target.commandLine) {
      throw ('Process identity changed for PID ' + $target.pid + '. Nothing will be stopped; retry the check.')
    }
    $processObject = [System.Diagnostics.Process]::GetProcessById([int]$target.pid)
    $null = $processObject.Handle
    $delta = [Math]::Abs(($processObject.StartTime.ToUniversalTime() - $current.CreationDate.ToUniversalTime()).TotalMilliseconds)
    if ($delta -ge 1) { $processObject.Dispose(); throw ('Process identity changed for PID ' + $target.pid) }
    $handles.Add($processObject)
  }
  foreach ($processObject in $handles) {
    if (-not $processObject.HasExited) { $processObject.Kill() }
  }
} finally {
  foreach ($processObject in $handles) { $processObject.Dispose() }
}
`, { ISEMO_REPAIR_TARGETS: JSON.stringify(processes) })
}

export function runWindowsNpm(projectRoot, args) {
  const permitted = [
    'ci --include=dev --include=optional --no-audit --no-fund',
    'run build',
  ]
  const argumentsText = args.join(' ')
  if (!permitted.includes(argumentsText)) throw new NodeRepairError('Unexpected npm recovery command.')
  // .cmd files require cmd.exe on Windows. Command text is fixed above; the
  // project path is passed as cwd and never concatenated into shell syntax.
  return new Promise((resolve, reject) => {
    const executable = process.env.SystemRoot ? path.win32.join(process.env.SystemRoot, 'System32/cmd.exe') : 'cmd.exe'
    const child = spawn(executable, ['/d', '/s', '/c', `npm.cmd ${argumentsText}`], {
      cwd: projectRoot, stdio: 'inherit', windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
}
