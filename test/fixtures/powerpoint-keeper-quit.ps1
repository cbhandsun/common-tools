param([Parameter(Mandatory=$true)][string]$GeneratedScript)
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($GeneratedScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Generated PowerPoint keeper script did not parse.' }
$functions = @('Get-ErrorCode', 'Test-TransientComFailure', 'Quit-PowerPointWithRetry')
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  if ($functions -contains $definition.Name) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
function Start-Sleep { param([int]$Milliseconds) }
function Require($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class KeeperQuitFixture {
  public int Attempts = 0;
  private readonly int failures;
  private readonly int hresult;
  public KeeperQuitFixture(int failures, int hresult) { this.failures = failures; this.hresult = hresult; }
  public void Quit() {
    Attempts++;
    if (Attempts <= failures) throw new COMException("fixture", hresult);
  }
}
'@
$transient = [KeeperQuitFixture]::new(2, -2147418111)
Quit-PowerPointWithRetry $transient
Require ($transient.Attempts -eq 3) 'Transient Quit failures did not recover within the bounded retry.'
$checks = 1
$permanent = [KeeperQuitFixture]::new(1, -2147467259)
$permanentFailed = $false
try { Quit-PowerPointWithRetry $permanent } catch { $permanentFailed = $true }
Require $permanentFailed 'A permanent Quit failure did not fail.'
Require ($permanent.Attempts -eq 1) 'A permanent Quit failure was retried.'
$checks += 2
$exhausted = [KeeperQuitFixture]::new(5, -2147417846)
$exhaustedFailed = $false
try { Quit-PowerPointWithRetry $exhausted } catch { $exhaustedFailed = $true }
Require $exhaustedFailed 'Exhausted transient Quit failures did not fail.'
Require ($exhausted.Attempts -eq 5) 'Transient Quit retry exceeded its fixed budget.'
$checks += 2
$nullFailed = $false
try { Quit-PowerPointWithRetry $null } catch { $nullFailed = $true }
Require $nullFailed 'A null PowerPoint application did not fail.'
$checks += 1
[pscustomobject]@{ passed=$true; checks=$checks } | ConvertTo-Json -Compress
