import test from 'node:test'
import assert from 'node:assert/strict'
import { sshRuntimeArgs, remoteBootCommand } from './oneclick-ssh.mjs'

test('Windows SSH startup uses one interactive session with no password suppression', () => {
  const args = sshRuntimeArgs()
  assert.ok(args.includes('-tt'))
  assert.ok(args.includes('BatchMode=no'))
  assert.ok(!args.includes('BatchMode=yes'))
  assert.equal(args.filter(x => x === 'ftisu-ser').length, 1)
  assert.ok(args.includes('127.0.0.1:13002:127.0.0.1:3102'))
  assert.equal(args.at(-1), remoteBootCommand())
  assert.ok(!args.includes('-N'), 'SSH also runs the GPU service on the same authenticated connection')
})

test('same session starts the real runtime and never kills or substitutes a process', () => {
  const command = remoteBootCommand()
  assert.ok(command.includes('git pull --ff-only origin feat/remote-gpu-full-pipeline-20261123'))
  assert.ok(command.includes('PORT=3102 ISEMO_INFERENCE_PORT=8102 npm run remote:qa-auto'))
  assert.ok(command.includes('while curl -fsS --max-time 2'))
  assert.ok(!/killall|pkill|kill\s+-9|ISEMO_ALLOW_UNVERIFIED=1|npm run remote:midterm-demo/.test(command))
})

test('remote script is correctly quoted without depending on a Windows shell', () => {
  const command = remoteBootCommand()
  assert.ok(command.startsWith("bash -lc '"))
  assert.ok(command.endsWith("'"))
  assert.ok(command.includes('cd "$HOME/services/isemotalk"'))
  assert.ok(command.includes('exec env PORT=3102'))
})
