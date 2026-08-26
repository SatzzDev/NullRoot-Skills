---
name: wsl-host-interop
description: Invoke Windows tools/data from WSL terminal.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [wsl, windows, interop, powershell, thermal, hardware]
    category: desktop
    related_skills: []
---

# WSL ↔ Windows Host Interop

Use when a task running in this WSL terminal needs to reach something that lives on the
Windows side — Windows PowerShell/CIM, a Windows-native binary, or hardware telemetry that
the Linux kernel in WSL does not expose.

## When to use
- "Cek suhu laptop / CPU temp", "lihat task manager di Windows", or any hardware telemetry ask.
- You need to run a Windows command / query from the WSL shell.
- A Linux tool is missing and the equivalent Windows binary is the fallback.

## Invoking Windows PowerShell from WSL
`powershell.exe` is **NOT on the WSL PATH** (bare `powershell.exe` → "command not found"),
but the binary exists and runs via its absolute path:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -Command "..."
```

`pwsh.exe` (PowerShell 7+) lives at `/mnt/c/Program Files/PowerShell/7/pwsh.exe` if installed.

**Pitfall — elevation:** WMI/CIM hardware queries need Windows admin. Under the default
WSL user (`satzz`) they return `Access denied` (`HRESULT 0x80041003`), e.g.:
```powershell
Get-CimInstance MSAcpi_ThermalZoneTemperature -Namespace root/wmi   # → Access denied
Get-WmiObject  MSAcpi_ThermalZoneTemperature -Namespace root/wmi   # → Access denied
```
There is no inline UAC prompt from WSL — the user must run the query from an elevated
Windows shell, or you fall back to suggesting a Windows-native tool (Task Manager →
Performance → CPU, HWiNFO64, Core Temp, Open Hardware Monitor, MyASUS/Armoury Crate).

## What Linux-side CANNOT see in WSL
- **CPU/package temperature**: `/sys/class/thermal/thermal_zone*/temp` is empty; installing
  `lm-sensors` only exposes the ACPI battery interface (`BAT1-acpi-0`, `in0`, `power1`), not
  core temps. Hardware thermal sensors are owned by Windows, not the WSL Linux kernel.
- Conclusion for "cek suhu": don't burn time installing lm-sensors or grepping /sys — go
  straight to a Windows-native reading (or an elevated powershell.exe CIM call).

## references/
- `references/wsl-to-windows-interop.md` — exact paths and a minimal WMI thermal probe
  template (for when the user can provide an elevated context).