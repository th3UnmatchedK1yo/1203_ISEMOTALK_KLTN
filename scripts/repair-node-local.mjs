import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import {
  NodeRepairError, readWindowsInventory, repairNodeDependencies,
  runWindowsNpm, stopWindowsProjectProcesses,
} from './node-repair-runtime.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  if (process.platform !== 'win32') throw new NodeRepairError('This repair command is for Windows. No changes were made.')
  if (Number(process.versions.node.split('.')[0]) < 22) throw new NodeRepairError('Node.js 22 or newer is required. No changes were made.')
  if (!existsSync(path.join(projectRoot, 'package.json')) || !existsSync(path.join(projectRoot, 'package-lock.json'))) {
    throw new NodeRepairError('Project package.json/package-lock.json missing. Run this script from its original repository.')
  }
  const args = process.argv.slice(2)
  if (args.some(arg => !['--check-only', '--stop-project-processes'].includes(arg))) {
    throw new NodeRepairError('Supported options: --check-only OR --stop-project-processes.')
  }
  console.log('ISEmoTalk - Windows Node dependency recovery')
  console.log(`Project: ${projectRoot}`)
  console.log('Database, uploads, Python venv and model caches are not recovery targets.')
  await repairNodeDependencies({
    projectRoot, checkOnly: args.includes('--check-only'), stopProjectProcesses: args.includes('--stop-project-processes'),
  }, {
    inventory: readWindowsInventory,
    stop: targets => stopWindowsProjectProcesses(targets, projectRoot),
    runNpm: args => runWindowsNpm(projectRoot, args),
    pause: setTimeout,
    log: console.log,
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = error instanceof NodeRepairError ? error.exitCode : 1
}
