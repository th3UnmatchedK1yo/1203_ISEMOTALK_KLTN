import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  classifyProjectProcess, inspectRepairState, repairNodeDependencies,
  readWindowsInventory, stopWindowsProjectProcesses,
  type WindowsProcess, type WindowsInventory,
} from '../../scripts/node-repair-runtime.mjs'

const root = String.raw`C:\Users\Legion\Documents\1203_KLTN`
const empty: WindowsInventory = { processes: [], listeners: [] }
const esbuild: WindowsProcess = {
  pid: 104, parentPid: 100, name: 'esbuild.exe',
  executablePath: `${root}\\node_modules\\@esbuild\\win32-x64\\esbuild.exe`,
  commandLine: 'esbuild.exe --service=0.21.5 --ping', createdAt: '2026-11-23T00:00:00.0000000Z',
}
const vite: WindowsProcess = {
  pid: 105, parentPid: 100, name: 'node.exe', executablePath: String.raw`C:\Program Files\nodejs\node.exe`,
  commandLine: `"C:\\Program Files\\nodejs\\node.exe" "${root}\\node_modules\\vite\\bin\\vite.js" preview`,
  createdAt: '2026-11-23T00:00:01.0000000Z',
}

function operations(snapshots: WindowsInventory[] = [empty]) {
  let index = 0
  return {
    inventory: vi.fn(async () => snapshots[Math.min(index++, snapshots.length - 1)]!),
    stop: vi.fn(async (_processes: WindowsProcess[]) => {}),
    runNpm: vi.fn(async (_args: string[]) => 0),
    pause: vi.fn(async () => {}),
    log: vi.fn(),
  }
}

describe('Windows project process ownership', () => {
  it('identifies the exact project esbuild executable even without an absolute command line', () => {
    expect(classifyProjectProcess(esbuild, root)).toContain('esbuild')
    expect(classifyProjectProcess({ ...esbuild, executablePath: `${root}-other\\node_modules\\@esbuild\\win32-x64\\esbuild.exe` }, root)).toBeNull()
  })

  it('identifies an absolute Vite entrypoint with spaces, but not a sibling repository or substring', () => {
    expect(classifyProjectProcess(vite, root)).toContain('vite')
    expect(classifyProjectProcess({ ...vite, commandLine: vite.commandLine.replace('1203_KLTN', '1203_KLTN-backup') }, root)).toBeNull()
    expect(classifyProjectProcess({ ...vite, commandLine: vite.commandLine.replace('vite.js"', 'vite.js.old"') }, root)).toBeNull()
  })

  it.each([
    `node --title "${root}\\node_modules\\vite\\bin\\vite.js" C:\\Other\\service.js`,
    `node --unknown-option "${root}\\node_modules\\vite\\bin\\vite.js" C:\\Other\\service.js`,
    `node "${root}\\node_modules\\vite\\bin\\vite.js".old`,
    `node ${root}\\node_modules\\vite\\bin\\"vite.js"`,
    `node "${root}\\node_modules\\vite\\bin\\vite.js`,
  ])('does not treat option operands or ambiguous quoting as an entrypoint: %s', commandLine => {
    expect(classifyProjectProcess({ ...vite, commandLine }, root)).toBeNull()
  })

  it('accepts known Node option arities only when the actual script is a project entrypoint', () => {
    expect(classifyProjectProcess({ ...vite, commandLine: `node --title demo --import tsx "${root}\\server\\src\\index.ts"` }, root)).toContain('server/src/index.ts')
    expect(classifyProjectProcess({ ...vite, commandLine: `node --import=tsx --enable-source-maps "${root}\\server\\src\\index.ts"` }, root)).toContain('server/src/index.ts')
  })

  it('recognizes the captured Windows short-root command against its canonical project directory', () => {
    const shortRoot = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\isemo repair I07wHm`
    const canonicalRoot = String.raw`C:\Users\runneradmin\AppData\Local\Temp\isemo repair I07wHm`
    const captured = {
      ...vite, pid: 6444,
      executablePath: String.raw`C:\hostedtoolcache\windows\node\22.23.5\x64\node.exe`,
      commandLine: `C:\\hostedtoolcache\\windows\\node\\22.23.5\\x64\\node.exe "${shortRoot}\\node_modules\\vite\\bin\\vite.js"`,
    }
    const resolveRoot = (directory: string) => directory === shortRoot || directory === canonicalRoot ? canonicalRoot : null
    expect(classifyProjectProcess(captured, canonicalRoot, resolveRoot)).toContain('vite')
    expect(classifyProjectProcess(captured, shortRoot, resolveRoot)).toContain('vite')
    expect(classifyProjectProcess({ ...esbuild, executablePath: `${shortRoot}\\node_modules\\tsx\\node_modules\\@esbuild\\win32-x64\\esbuild.exe` }, canonicalRoot, resolveRoot)).toContain('esbuild')
  })

  it('does not merge case-sensitive sibling roots and accepts case aliases only after directory proof', () => {
    const upperRoot = String.raw`C:\Repos\App`
    const lowerRoot = String.raw`C:\Repos\app`
    const lowerEntry = { ...vite, commandLine: `node "${lowerRoot}\\node_modules\\vite\\bin\\vite.js"` }
    const separateDirectories = (directory: string) => directory === upperRoot || directory === lowerRoot ? directory : null
    expect(classifyProjectProcess(lowerEntry, upperRoot, separateDirectories)).toBeNull()
    expect(classifyProjectProcess(lowerEntry, upperRoot, () => null)).toBeNull()
    const sameDirectory = (directory: string) => directory === upperRoot || directory === lowerRoot ? upperRoot : null
    expect(classifyProjectProcess(lowerEntry, upperRoot, sameDirectory)).toContain('vite')
  })

  it('does not equate separate project roots just because their dependency file is shared', () => {
    const otherRoot = String.raw`C:\OtherCheckout`
    const sharedEntry = String.raw`C:\SharedPackages\vite\bin\vite.js`
    const resolveRoot = (directory: string) => {
      if (directory.endsWith(String.raw`\node_modules\vite\bin\vite.js`)) return sharedEntry
      return directory === root || directory === otherRoot ? directory : null
    }
    expect(classifyProjectProcess({ ...vite, commandLine: `node "${otherRoot}\\node_modules\\vite\\bin\\vite.js"` }, root, resolveRoot)).toBeNull()
  })

  it('rejects current-drive-rooted paths and unsuccessful directory resolutions', () => {
    const driveRelative = { ...vite, commandLine: String.raw`node "\Users\Legion\Documents\1203_KLTN\node_modules\vite\bin\vite.js"` }
    expect(classifyProjectProcess(driveRelative, root, () => root)).toBeNull()
    const other = { ...vite, commandLine: String.raw`node C:\Unknown\node_modules\vite\bin\vite.js` }
    expect(classifyProjectProcess(other, root, () => null)).toBeNull()
    expect(classifyProjectProcess(other, root, () => '')).toBeNull()
  })

  it.each([
    'node_modules/@esbuild/win32-x64/esbuild.exe',
    'node_modules/@esbuild/win32-arm64/esbuild.exe',
    'node_modules/@esbuild/win32-ia32/esbuild.exe',
    'node_modules/tsx/node_modules/@esbuild/win32-x64/esbuild.exe',
    'node_modules/tsx/node_modules/@esbuild/win32-arm64/esbuild.exe',
    'node_modules/tsx/node_modules/@esbuild/win32-ia32/esbuild.exe',
  ])('identifies the exact locked esbuild location %s', relative => {
    const executablePath = path.win32.join(root, relative)
    expect(classifyProjectProcess({ ...esbuild, executablePath }, root)).toContain('esbuild')
    expect(classifyProjectProcess({ ...esbuild, executablePath: executablePath + '.old' }, root)).toBeNull()
    expect(classifyProjectProcess({ ...esbuild, executablePath: path.win32.join(root + '-other', relative) }, root)).toBeNull()
  })

  it('does not infer ownership from a relative API command or a terminal/editor mentioning the project', () => {
    expect(classifyProjectProcess({ ...vite, commandLine: 'node --import tsx server/src/index.ts' }, root)).toBeNull()
    expect(classifyProjectProcess({ ...vite, name: 'Code.exe', commandLine: `Code.exe "${root}"` }, root)).toBeNull()
    expect(classifyProjectProcess({ ...vite, name: 'powershell.exe', commandLine: `powershell -Command "node '${root}\\scripts\\start-demo.mjs'"` }, root)).toBeNull()
  })

  it('only identifies the project venv when it is running this inference app', () => {
    const python = { ...vite, name: 'python.exe', executablePath: `${root}\\inference\\.venv\\Scripts\\python.exe`, commandLine: 'python.exe -m uvicorn app.main:app --port 8001' }
    expect(classifyProjectProcess(python, root)).toContain('inference')
    expect(classifyProjectProcess({ ...python, commandLine: 'python.exe train.py' }, root)).toBeNull()
    expect(classifyProjectProcess({ ...python, executablePath: String.raw`C:\Python311\python.exe` }, root)).toBeNull()
  })

  it('reports port ownership separately and fails closed when metadata is missing', () => {
    const state = inspectRepairState({ processes: [vite], listeners: [{ port: 5173, pid: vite.pid }, { port: 3001, pid: 999 }] }, root)
    expect(state.owned.map(process => process.pid)).toEqual([vite.pid])
    expect(state.unknownListeners).toEqual([{ port: 3001, pid: 999 }])
    expect(classifyProjectProcess({ ...esbuild, executablePath: '', createdAt: '' }, root)).toBeNull()
  })
})

describe('safe dependency recovery', () => {
  it('blocks installation while a known project service or esbuild is active', async () => {
    const deps = operations([{ processes: [esbuild], listeners: [] }])
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toThrow(/Ctrl\+C/)
    expect(deps.stop).not.toHaveBeenCalled()
    expect(deps.runNpm).not.toHaveBeenCalled()
  })

  it('blocks installation when nested tsx esbuild holds files without a listener', async () => {
    const nested = { ...esbuild, executablePath: `${root}\\node_modules\\tsx\\node_modules\\@esbuild\\win32-x64\\esbuild.exe` }
    const deps = operations([{ processes: [nested], listeners: [] }])
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toThrow(/Ctrl\+C/)
    expect(deps.stop).not.toHaveBeenCalled()
    expect(deps.runNpm).not.toHaveBeenCalled()
  })

  it('never stops a process when any demo port has unproven ownership', async () => {
    const deps = operations([{ processes: [esbuild], listeners: [{ pid: 999, port: 3001 }] }])
    await expect(repairNodeDependencies({ projectRoot: root, stopProjectProcesses: true }, deps)).rejects.toThrow(/3001.*999/)
    expect(deps.stop).not.toHaveBeenCalled()
    expect(deps.runNpm).not.toHaveBeenCalled()
  })

  it('does not install or stop anything in check-only mode', async () => {
    const deps = operations()
    await repairNodeDependencies({ projectRoot: root, checkOnly: true }, deps)
    expect(deps.stop).not.toHaveBeenCalled()
    expect(deps.runNpm).not.toHaveBeenCalled()
    await expect(repairNodeDependencies({ projectRoot: root, checkOnly: true, stopProjectProcesses: true }, deps)).rejects.toThrow(/CheckOnly/)
  })

  it('stops only positively owned processes, rechecks, and then runs install before build', async () => {
    const unrelated = { ...vite, pid: 333, commandLine: 'node another-app.js' }
    const deps = operations([{ processes: [esbuild, unrelated], listeners: [] }, empty])
    await repairNodeDependencies({ projectRoot: root, stopProjectProcesses: true }, deps)
    expect(deps.stop).toHaveBeenCalledTimes(1)
    expect(deps.stop).toHaveBeenCalledWith([esbuild])
    expect(deps.inventory.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(deps.runNpm.mock.calls).toEqual([
      [['ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund']],
      [['run', 'build']],
    ])
  })

  it('does not install when a stopped service restarts or remains running', async () => {
    const deps = operations([{ processes: [esbuild], listeners: [] }])
    await expect(repairNodeDependencies({ projectRoot: root, stopProjectProcesses: true }, deps)).rejects.toThrow(/still active/)
    expect(deps.stop).toHaveBeenCalledTimes(1)
    expect(deps.runNpm).not.toHaveBeenCalled()
  })

  it('does not install if a service appears between the initial scan and final preflight', async () => {
    const deps = operations([empty, { processes: [vite], listeners: [{ port: 5173, pid: vite.pid }] }])
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toThrow(/active/)
    expect(deps.runNpm).not.toHaveBeenCalled()
  })

  it('does not build after npm ci fails, and preserves the native error code', async () => {
    const deps = operations()
    deps.runNpm.mockResolvedValueOnce(7)
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toMatchObject({ exitCode: 7 })
    expect(deps.runNpm).toHaveBeenCalledTimes(1)
  })

  it('reports build failure instead of claiming a successful repair', async () => {
    const deps = operations()
    deps.runNpm.mockResolvedValueOnce(0).mockResolvedValueOnce(3)
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toMatchObject({ exitCode: 3 })
  })

  it('blocks installation when process or listener inspection fails', async () => {
    const deps = operations()
    deps.inventory.mockRejectedValue(new Error('CIM access failed'))
    await expect(repairNodeDependencies({ projectRoot: root }, deps)).rejects.toThrow('CIM access failed')
    expect(deps.stop).not.toHaveBeenCalled()
    expect(deps.runNpm).not.toHaveBeenCalled()
  })
})

const tempRoots: string[] = []
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== 'win32')('native Windows PowerShell 5.1 recovery wrapper', () => {
  it('uses the first PATH Node match, verifies both identities, and stops both workers before invoking npm', async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), 'isemo repair '))
    tempRoots.push(fixture)
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts')
    await mkdir(path.join(fixture, 'scripts'))
    await mkdir(path.join(fixture, 'node_modules/vite/bin'), { recursive: true })
    await mkdir(path.join(fixture, 'fake-bin'))
    const secondaryNodeDirectory = path.join(fixture, 'secondary-node')
    await mkdir(secondaryNodeDirectory)
    // A second valid executable named node.exe makes the multiple-PATH-match
    // regression deterministic without copying the much larger Node binary.
    // It must never run: the real Node directory precedes this directory.
    const windowsRoot = process.env.SystemRoot
    if (!windowsRoot) throw new Error('Windows SystemRoot is missing')
    await copyFile(path.join(windowsRoot, 'System32/where.exe'), path.join(secondaryNodeDirectory, 'node.exe'))
    for (const name of ['repair-node-local.ps1', 'repair-node-local.mjs', 'node-repair-runtime.mjs']) {
      await copyFile(path.join(source, name), path.join(fixture, 'scripts', name))
    }
    await writeFile(path.join(fixture, 'package.json'), '{"name":"repair-fixture"}')
    await writeFile(path.join(fixture, 'package-lock.json'), '{"lockfileVersion":3}')
    const protectedFiles = [
      'server/data/isemotalk.db', 'server/data/uploads/call.wav',
      'inference/.env', 'inference/.venv/preserved.marker', 'models/checkpoint.marker',
    ]
    for (const relative of protectedFiles) {
      await mkdir(path.dirname(path.join(fixture, relative)), { recursive: true })
      await writeFile(path.join(fixture, relative), `preserve ${relative}`)
    }
    await writeFile(path.join(fixture, 'node_modules/vite/bin/vite.js'), 'setInterval(() => {}, 1000)')
    const record = path.join(fixture, 'npm-commands.txt')
    const workerErrors = ['', '']
    const workers = [0, 1].map(index => {
      const worker = spawn(process.execPath, [path.join(fixture, 'node_modules/vite/bin/vite.js')], { stdio: ['ignore', 'ignore', 'pipe'] })
      worker.stderr.on('data', chunk => { workerErrors[index] = (workerErrors[index] + String(chunk)).slice(-2000) })
      return worker
    })
    await Promise.all(workers.map(worker => new Promise<void>((resolve, reject) => { worker.once('spawn', resolve); worker.once('error', reject) })))
    const observedAtInstall = path.join(fixture, 'workers-at-install.json')
    const checkWorkers = path.join(fixture, 'fake-bin/check-workers.cjs')
    await writeFile(checkWorkers, `
      const pids = ${JSON.stringify(workers.map(worker => worker.pid))};
      const alive = pids.filter(pid => {
        try { process.kill(pid, 0); return true; }
        catch (error) { if (error.code === 'ESRCH') return false; throw error; }
      });
      require('node:fs').writeFileSync(${JSON.stringify(observedAtInstall)}, JSON.stringify(alive));
      process.exit(alive.length ? 91 : 0);
    `)
    await writeFile(path.join(fixture, 'fake-bin/npm.cmd'), `@echo off\r\n"${process.execPath}" "${checkWorkers}"\r\nif errorlevel 1 exit /b %errorlevel%\r\necho %*>>"${record}"\r\nexit /b 7\r\n`)
    const execute = (extra: string[]) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const env = { ...process.env }
      const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
      env[pathKey] = [path.join(fixture, 'fake-bin'), path.dirname(process.execPath), secondaryNodeDirectory, env[pathKey] ?? ''].join(';')
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(fixture, 'scripts/repair-node-local.ps1'), ...extra], { cwd: fixture, env })
      let output = ''
      child.stdout.on('data', chunk => { output += String(chunk) })
      child.stderr.on('data', chunk => { output += String(chunk) })
      child.once('error', reject)
      child.once('exit', code => resolve({ code, output }))
    })
    try {
      const blocked = await execute(['-CheckOnly'])
      let blockedDetails = blocked.output
      if (blocked.code !== 2) {
        const nativeInventory = await readWindowsInventory()
        const canonicalFixture = realpathSync.native(fixture)
        const fixtureProcesses = workers.map((worker, index) => {
          const row = nativeInventory.processes.find(item => item.pid === worker.pid)
          // Only disclose command lines from these generated fixture workers.
          // If a PID has exited or been reused, do not log another process's metadata.
          const safeRow = worker.exitCode === null && row?.commandLine.includes(path.basename(fixture)) ? row : null
          return {
            pid: worker.pid, exitCode: worker.exitCode, signalCode: worker.signalCode,
            stderr: workerErrors[index], presentInInventory: Boolean(row), process: safeRow,
            rawRootOwnership: safeRow ? classifyProjectProcess(safeRow, fixture) : null,
            canonicalRootOwnership: safeRow ? classifyProjectProcess(safeRow, canonicalFixture) : null,
          }
        })
        blockedDetails += `\nFixture diagnostics: ${JSON.stringify({ rawFixture: fixture, canonicalFixture, workers: fixtureProcesses }, null, 2)}`
      }
      expect(blocked.code, blockedDetails).toBe(2)
      for (const worker of workers) expect(blocked.output).toContain(String(worker.pid))
      await expect(readFile(record, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
      const inventory = await readWindowsInventory()
      const observed = workers.map(worker => {
        const current = inventory.processes.find(item => item.pid === worker.pid)
        if (!current) throw new Error('Native fixture process disappeared before the identity check')
        return current
      })
      for (const current of observed) {
        expect(classifyProjectProcess(current, fixture)).toContain('vite')
        expect(classifyProjectProcess(current, realpathSync.native(fixture))).toContain('vite')
      }
      await expect(stopWindowsProjectProcesses([observed[0]!, { ...observed[1]!, createdAt: '2000-01-01T00:00:00.0000000Z' }], fixture))
        .rejects.toThrow(/identity changed/)
      for (const worker of workers) {
        expect(worker.exitCode).toBeNull()
        expect(worker.signalCode).toBeNull()
        expect(() => process.kill(worker.pid!, 0)).not.toThrow()
      }
      const failedInstall = await execute(['-StopProjectProcesses'])
      expect(failedInstall.code, failedInstall.output).toBe(7)
      expect(JSON.parse(await readFile(observedAtInstall, 'utf8'))).toEqual([])
      expect(await readFile(record, 'utf8')).toContain('ci --include=dev')
      expect(await readFile(record, 'utf8')).not.toContain('run build')
      for (const worker of workers) expect(worker.exitCode !== null || worker.signalCode !== null).toBe(true)
      for (const relative of protectedFiles) {
        expect(await readFile(path.join(fixture, relative), 'utf8')).toBe(`preserve ${relative}`)
      }
    } finally {
      for (const worker of workers) {
        if (worker.exitCode === null && worker.signalCode === null) worker.kill()
      }
    }
  }, 45_000)
})
