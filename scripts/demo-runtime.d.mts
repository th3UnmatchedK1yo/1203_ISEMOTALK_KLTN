import type { ConcurrentlyResult } from 'concurrently'

export interface DemoPrerequisites {
  python: string
  dataDir: string
  uploadsDir: string
  childEnv: NodeJS.ProcessEnv
}

export function checkDemoPrerequisites(projectRoot: string, env?: NodeJS.ProcessEnv): DemoPrerequisites
export function assertLoopbackPortsAvailable(ports: number[]): Promise<void>
export function startDemoServices(projectRoot: string, childEnv: NodeJS.ProcessEnv): ConcurrentlyResult
