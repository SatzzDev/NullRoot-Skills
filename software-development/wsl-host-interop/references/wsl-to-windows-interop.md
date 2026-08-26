# WSL → Windows Interop Reference

Exact paths and a minimal WMI thermal probe template.

## Windows PowerShell / pwsh absolute paths
- Windows PowerShell 5.1: `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`
- PowerShell 7+ (if installed): `/mnt/c/Program Files/PowerShell/7/pwsh.exe`
- cmd.exe: `/mnt/c/Windows/System32/cmd.exe`

Usage pattern:
```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -Command "Your-Command"
```

## WMI Thermal Probe (requires elevated Windows session)
This template only works when the user runs it from an elevated (Administrator) PowerShell window
on the Windows side. From WSL it returns "Access denied" (HRESULT 0x80041003).

```powershell
# Save as C:\temp\get-thermal.ps1 and run elevated:
Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi |
  ForEach-Object {
    $c = [math]::Round(($_.CurrentTemperature - 2732) / 10, 1)
    Write-Host "Zone: $($_.InstanceName) -> $c °C"
  }
```

Alternative using OpenHardwareMonitor WMI (if OHM is installed and running elevated):
```powershell
Get-WmiObject -Namespace "root\OpenHardwareMonitor" -Class "Sensor" |
  Where-Object { $_.SensorType -eq "Temperature" -and $_.Name -like "*CPU*" } |
  Select-Object Name, Value | Format-Table -AutoSize
```

## What to suggest when elevation is not available
- Task Manager → Performance → CPU (shows package temp on newer Windows)
- HWiNFO64 (sensors-only mode, portable)
- Core Temp (lightweight)
- Open Hardware Monitor
- MyASUS / Armoury Crate (ASUS laptops)

## Quick Linux-side sanity check (always returns empty in WSL)
```bash
cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null  # empty
sensors  # only ACPI battery, no CPU cores
```