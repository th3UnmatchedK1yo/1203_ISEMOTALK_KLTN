// SSH configuration for the Windows one-click launcher.
//
// The FTISU alias may authenticate with a registered SSH key OR an account
// password. Do not use BatchMode=yes: it forbids password prompts, causing
// "Permission denied (publickey,password)" even for valid user accounts.
//
// A SINGLE SSH session owns both -L forwarding and the remote runtime. This
// avoids requiring the student to authenticate a second time.
const BRANCH = 'feat/remote-gpu-full-pipeline-20261123'

function quoteShell(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

export function remoteBootCommand() {
  const commands = [
    'set -e',
    'cd "$HOME/services/isemotalk"',
    'git fetch origin',
    'git switch ' + BRANCH,
    'git pull --ff-only origin ' + BRANCH,
    '. "$HOME/.local/share/isemotalk-node-env.sh"',
    // A prior one-click session may already own port 3102. Keep this SSH
    // forward alive if a health endpoint is present, but the laptop still
    // validates the real model's health and will refuse incompatible modes.
    'if curl -fsS --max-time 2 http://127.0.0.1:3102/api/system/status >/dev/null 2>&1; then',
    '  echo "[ISEmoTalk] FTISU API already listening on 3102; using existing service."',
    '  while curl -fsS --max-time 2 http://127.0.0.1:3102/api/system/status >/dev/null 2>&1; do sleep 15; done',
    '  exit 0',
    'fi',
    // Dedicated loopback ports avoid interfering with the previous preview
    // instance on 3101; do not stop any remote process automatically.
    'exec env PORT=3102 ISEMO_INFERENCE_PORT=8102 npm run remote:qa-auto',
  ].join('\n')
  return 'bash -lc ' + quoteShell(commands)
}

export function sshRuntimeArgs() {
  return [
    '-tt', // remote PTY forwards Ctrl+C/SIGHUP to the session it owns
    '-o', 'BatchMode=no', // allow Windows console prompt if SSH key is absent
    '-o', 'NumberOfPasswordPrompts=3',
    '-o', 'ConnectTimeout=15',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-L', '127.0.0.1:13002:127.0.0.1:3102',
    'ftisu-ser', remoteBootCommand(),
  ]
}
