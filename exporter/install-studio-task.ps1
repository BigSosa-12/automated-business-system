<#
 Registers "ProspectFoundry_TemplateStudio": starts the private Template Studio (127.0.0.1:4478) at your Windows logon so the
 dashboard's Templates tab is always connected. It only serves the local template library. It does not touch the outreach
 queue, SQLite, Gmail or the dispatch schedule. Run once:  powershell -File exporter\install-studio-task.ps1
 Remove:  powershell -File exporter\install-studio-task.ps1 -Remove
#>
param([switch]$Remove, [string]$Src = (Join-Path $env:USERPROFILE 'OneDrive\Desktop\OutreachQueue'))
$ErrorActionPreference = 'Stop'
$name = 'ProspectFoundry_TemplateStudio'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "Removed $name"; return }
$node = (Get-Command node -ErrorAction Stop).Source
$repo = Split-Path -Parent $PSScriptRoot
$script = Join-Path $repo 'studio\template-studio.mjs'
if (-not (Test-Path $script)) { throw "Not found: $script (pull the latest repo first)" }
$cmd = "& '$node' '$script' --src '$Src'"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -Command `"$cmd`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $name
Write-Host "Installed and started $name. Open the dashboard's Templates tab (or http://127.0.0.1:4478)."
