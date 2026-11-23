import { execFile } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePythonExecutable } from '../../scripts/python-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const directories: string[] = []

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'isemo-python-runtime-'))
  directories.push(dir)
  mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  mkdirSync(path.join(dir, 'inference'), { recursive: true })
  for (const name of ['run-python.mjs', 'python-runtime.mjs']) {
    const source = path.join(projectRoot, 'scripts', name)
    copyFileSync(source, path.join(dir, 'scripts', name))
  }
  return dir
}

function runWrapper(dir: string, python: string, args: string[]) {
  return new Promise<{ code: number; output: string }>((resolve, reject) => {
    execFile(process.execPath, [path.join(dir, 'scripts/run-python.mjs'), ...args], { cwd: dir, env: { ...process.env, ISEMO_PYTHON: python }, timeout: 5000 }, (error, stdout, stderr) => {
      if (error && (error.killed || typeof error.code !== 'number')) reject(error)
      else resolve({ code: typeof error?.code === 'number' ? error.code : 0, output: stdout + stderr })
    })
  })
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('Python executable selection and process diagnostics', () => {
  it.each(['win32', 'linux'] as const)('selects the project venv executable layout for %s', (platform) => {
    const dir = fixture()
    const executable = path.join(dir, 'inference', '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    mkdirSync(path.dirname(executable), { recursive: true })
    writeFileSync(executable, '', { mode: 0o755 })
    expect(resolvePythonExecutable(dir, {}, platform)).toBe(executable)
  })

  it('honors an absolute prepared-interpreter override even without a project venv', () => {
    expect(resolvePythonExecutable(fixture(), { ISEMO_PYTHON: process.execPath })).toBe(process.execPath)
  })

  it('rejects a directory in place of a runnable interpreter', () => {
    const dir = fixture()
    expect(() => resolvePythonExecutable(dir, { ISEMO_PYTHON: dir })).toThrow('requirements-core.txt')
  })

  it.skipIf(process.platform === 'win32')('preserves a venv symlink path instead of resolving to the global executable', () => {
    const dir = fixture()
    const executable = path.join(dir, 'inference', '.venv', 'bin', 'python')
    mkdirSync(path.dirname(executable), { recursive: true })
    symlinkSync(process.execPath, executable)
    expect(resolvePythonExecutable(dir, {}, 'linux')).toBe(executable)
  })

  it.skipIf(process.platform === 'win32')('rejects an interpreter without execution permission', () => {
    const dir = fixture()
    const executable = path.join(dir, 'not-executable')
    writeFileSync(executable, '')
    chmodSync(executable, 0o644)
    expect(() => resolvePythonExecutable(dir, { ISEMO_PYTHON: executable })).toThrow(executable)
  })

  it('rejects a relative override before cwd changes can select another executable', async () => {
    const dir = fixture()
    const result = await runWrapper(dir, path.relative(dir, process.execPath), ['-e', 'process.exit(0)'])
    expect(result.code).toBe(1)
    expect(result.output).toMatch(/ISEMO_PYTHON.*tuyệt đối/)
    expect(result.output).not.toContain('ENOENT')
  })

  it('reports the selected executable, child PID and exit code without hiding a child failure', async () => {
    const dir = fixture()
    // Node is a portable fixture executable; this tests supervision, not Python or a model.
    const result = await runWrapper(dir, process.execPath, ['-e', 'console.log("fixture child ran"); process.exit(7)'])
    expect(result.code).toBe(7)
    expect(result.output).toContain(process.execPath)
    expect(result.output).toMatch(/PID=\d+/)
    expect(result.output).toContain('code=7')
    expect(result.output).toContain('fixture child ran')
  })

  it.skipIf(process.platform === 'win32')('logs and forwards a POSIX stop signal to the running child', async () => {
    const dir = fixture()
    const result = await runWrapper(dir, process.execPath, ['-e', `
      const deadline = setTimeout(() => process.exit(9), 2000);
      process.on('SIGTERM', () => { clearTimeout(deadline); console.log('fixture received SIGTERM'); process.exit(0) });
      process.kill(process.ppid, 'SIGTERM');
    `])
    expect(result.code).toBe(0)
    expect(result.output).toContain('Nhận SIGTERM')
    expect(result.output).toContain('fixture received SIGTERM')
    expect(result.output).toContain('signal=none')
  })

  it('reports a missing absolute executable with a preparation instruction', async () => {
    const dir = fixture()
    const missing = path.join(dir, 'missing-python.exe')
    const result = await runWrapper(dir, missing, [])
    expect(result.code).toBe(1)
    expect(result.output).toContain(missing)
    expect(result.output).toContain('requirements-core.txt')
  })
})
