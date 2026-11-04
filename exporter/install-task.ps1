<#
 Installs the dashboard exporter as a Windows scheduled task (every 5 minutes, one instance at a time).
 Touches NOTHING else: existing BattleCreek_Prospect_Foundry_* tasks are not read, changed or restarted.
 Usage (PowerShell, as the logged-in user):  .\exporter\install-task.ps1            # install
                                              .\exporter\install-task.ps1 -Remove    # uninstall
#>
param([switch]$Remove, [int]$EveryMinutes = 5)
$ErrorActionPreference = 'Stop'
$name = 'ProspectFoundry_DashboardExport'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host "Removed $name"; return }
$repo = Split-Path -Parent $PSScriptRoot
$node = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $node)) { throw "Node not found at $node" }
$action = New-ScheduledTaskAction -Execute $node -Argument "--no-warnings `"$repo\exporter\export-snapshot.mjs`" --publish" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited   # runs as you, so Git uses your existing GitHub sign-in
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Read-only Prospect Foundry dashboard snapshot export + git publish' -Force | Out-Null
Write-Host "Installed $name (every $EveryMinutes min). Logs: $repo\exporter\state\export.log"
