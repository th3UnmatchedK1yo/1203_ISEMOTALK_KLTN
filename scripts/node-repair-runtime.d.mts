export interface WindowsProcess {
  pid: number
  parentPid: number
  name: string
  executablePath: string
  commandLine: string
  createdAt: string
}
export interface WindowsListener { port: number; pid: number }
export interface WindowsInventory { processes: WindowsProcess[]; listeners: WindowsListener[] }
export interface RepairOptions { projectRoot: string; checkOnly?: boolean; stopProjectProcesses?: boolean }
export interface RepairOperations {
  inventory: () => Promise<WindowsInventory>
  stop: (processes: WindowsProcess[]) => Promise<void>
  runNpm: (args: string[]) => Promise<number>
  pause: (milliseconds: number) => Promise<void>
  log: (message: string) => void
}
export class NodeRepairError extends Error { constructor(message: string, exitCode?: number); exitCode: number }
export function classifyProjectProcess(processInfo: WindowsProcess, projectRoot: string, resolveDirectory?: (directory: string) => string | null): string | null
export function inspectRepairState(inventory: WindowsInventory, projectRoot: string): {
  owned: WindowsProcess[]; listeners: WindowsListener[]; unknownListeners: WindowsListener[]
}
export function repairNodeDependencies(options: RepairOptions, operations: RepairOperations): Promise<void>
export function readWindowsInventory(): Promise<WindowsInventory>
export function stopWindowsProjectProcesses(processes: WindowsProcess[], projectRoot: string): Promise<void>
export function runWindowsNpm(projectRoot: string, args: string[]): Promise<number>
