$ErrorActionPreference = 'Stop'

function Enter-CommonToolsTeamRuntimeOperationLock {
  param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]{0,63}$')]
    [string]$Project
  )

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Project)
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hasher.ComputeHash($bytes)
  } finally {
    $hasher.Dispose()
  }
  $suffix = [System.BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant()
  $mutex = [System.Threading.Mutex]::new($false, "common-tools-team-runtime-$suffix")
  try {
    if (-not $mutex.WaitOne(0)) {
      throw "Another Common Tools team runtime operation is already active for project '$Project'"
    }
  } catch [System.Threading.AbandonedMutexException] {
    # The operating system released the abandoned mutex to this process. It is
    # safe to continue because Compose itself remains the source of truth.
  } catch {
    $mutex.Dispose()
    throw
  }
  return $mutex
}

function Exit-CommonToolsTeamRuntimeOperationLock {
  param(
    [AllowNull()]
    [System.Threading.Mutex]$Lock
  )

  if ($null -eq $Lock) { return }
  try {
    $Lock.ReleaseMutex()
  } finally {
    $Lock.Dispose()
  }
}
