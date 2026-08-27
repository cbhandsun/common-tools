function Test-DockerEngineProbe {
  [CmdletBinding()]
  param(
    [ValidateRange(1000, 5000)]
    [int]$TimeoutMilliseconds
  )

  $process = $null
  try {
    # Resolve docker.exe explicitly; an extensionless shim can differ from the
    # interactive CLI. Use ProcessStartInfo rather than a nested hidden
    # Start-Process so the probe behaves the same in CI and smoke scripts.
    $dockerPath = (Get-Command -Name 'docker.exe' -CommandType Application -ErrorAction Stop).Source
    if ([string]::IsNullOrWhiteSpace($dockerPath) -or -not [System.IO.File]::Exists($dockerPath)) { throw 'Docker CLI executable is unavailable' }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $dockerPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    # ArgumentList is unavailable on Windows PowerShell 5.1, which is still
    # commonly used by hidden CI/build invocations. This is a fixed command,
    # not user input, so a literal argument string is safe and portable.
    $startInfo.Arguments = 'version --format "{{.Server.Version}}"'
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { return $false }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutMilliseconds)) {
      if (-not $process.HasExited) { $process.Kill($true) }
      return $false
    }
    [System.Threading.Tasks.Task]::WaitAll(@($stdoutTask, $stderrTask))
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout)) {
      return $false
    }
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $process) {
      if (-not $process.HasExited) { $process.Kill($true) }
      $process.Dispose()
    }
  }
}

function Test-DockerVolumeExists {
  [CmdletBinding()]
  param(
    [ValidatePattern('^[a-z0-9][a-z0-9_.-]{0,127}$')]
    [string]$Name
  )

  $process = $null
  try {
    $dockerPath = (Get-Command -Name 'docker.exe' -CommandType Application -ErrorAction Stop).Source
    if ([string]::IsNullOrWhiteSpace($dockerPath) -or -not [System.IO.File]::Exists($dockerPath)) { return $false }
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $dockerPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.Arguments = "volume inspect $Name"
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { return $false }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(5000)) {
      if (-not $process.HasExited) { $process.Kill($true) }
      return $false
    }
    [System.Threading.Tasks.Task]::WaitAll(@($stdoutTask, $stderrTask))
    return $process.ExitCode -eq 0
  } catch {
    return $false
  } finally {
    if ($null -ne $process) {
      if (-not $process.HasExited) { $process.Kill($true) }
      $process.Dispose()
    }
  }
}

function Assert-DockerEngineAvailable {
  [CmdletBinding()]
  param(
    [ValidateRange(5, 60)]
    [int]$TimeoutSeconds = 20
  )

  # Docker Desktop can expose its CLI before the daemon accepts requests.
  # Bound each child process so a stuck pipe does not consume the whole startup
  # window, then retry until the caller's explicit deadline.
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    $remainingMilliseconds = [Math]::Floor(($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    if ($remainingMilliseconds -le 0) { break }
    if ($remainingMilliseconds -lt 1000) { break }
    $attemptMilliseconds = [Math]::Min(5000, [int]$remainingMilliseconds)
    if (Test-DockerEngineProbe -TimeoutMilliseconds $attemptMilliseconds) { return }
    $remainingMilliseconds = [Math]::Floor(($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    if ($remainingMilliseconds -gt 0) {
      Start-Sleep -Milliseconds ([Math]::Min(750, [int]$remainingMilliseconds))
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Docker Engine is unavailable or did not respond within $TimeoutSeconds seconds"
}
