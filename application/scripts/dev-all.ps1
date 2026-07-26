#!/usr/bin/env pwsh
# ============================================================
# dev-all.ps1 — dev-all.sh 的 PowerShell 版本（Windows 用）
# 同時啟動 Python epistemic 服務 + Node 後端，方便本機開發。
#
# 用法（擇一）：
#   npm run dev:all:win          （在 application/ 底下）
#   pwsh scripts/dev-all.ps1     （PowerShell 7+，跨平台都能跑）
#   powershell scripts/dev-all.ps1   （Windows 內建的 PowerShell 5.1 也可以，
#                                      但建議用 pwsh，Ctrl+C 清理行為比較穩定）
#
# Ctrl+C 會透過 finally 區塊把 Python 服務一起關掉，不會留下背景殭屍程序。
# ============================================================

$ErrorActionPreference = 'Stop'

# 確保 CWD 是 application/（本腳本放在 application/scripts/ 底下）
$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

$epiPort  = if ($env:EPISTEMIC_PORT) { $env:EPISTEMIC_PORT } else { '8765' }
$nodePort = if ($env:PORT)           { $env:PORT }           else { '3001' }

# Windows 上 python 指令通常叫 python，不是 python3；兩個都試
function Get-PythonCommand {
    foreach ($cmd in @('python3', 'python')) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) { return $cmd }
    }
    throw "找不到 python3 或 python，請先安裝 Python 並加入 PATH。"
}
$pythonCmd = Get-PythonCommand

Write-Host "[dev-all] 啟動 Epistemic 服務（$pythonCmd, port $epiPort）..."

$epiProc = Start-Process -FilePath $pythonCmd `
    -ArgumentList '../integration/epistemic_adapter/http_server.py' `
    -WorkingDirectory $appDir `
    -PassThru -NoNewWindow

Write-Host "[dev-all] Epistemic 服務 PID: $($epiProc.Id)（萬一需要手動清理可以記一下）"

function Stop-EpistemicService {
    if ($epiProc -and -not $epiProc.HasExited) {
        Write-Host ""
        Write-Host "[dev-all] 關閉服務..."
        Stop-Process -Id $epiProc.Id -Force -ErrorAction SilentlyContinue
    }
}

# 注意：Ctrl+C 中斷時 finally 區塊是否一定會執行，PowerShell 7+ (pwsh) 比
# Windows 內建的 PowerShell 5.1 可靠很多，這也是最上面建議優先用 pwsh 的原因。
# 萬一真的殘留了 process，手動清掉：Get-Process python* | Where-Object Id -eq <PID> | Stop-Process
# 或直接 Get-Process -Name python3,python -ErrorAction SilentlyContinue | Stop-Process -Force

try {
    # 等 Python 服務就緒再啟動 Node，避免 Node 啟動瞬間打到還沒起來的服務
    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$epiPort/health" -UseBasicParsing -TimeoutSec 1
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            # 服務還沒起來，忽略錯誤繼續重試
        }
        Start-Sleep -Milliseconds 500
    }

    if ($ready) {
        Write-Host "[dev-all] Epistemic 服務就緒。"
    } else {
        Write-Warning "[dev-all] 等了 10 秒 Epistemic 服務還沒回應，仍繼續啟動 Node（API 呼叫可能會先失敗）。"
    }

    Write-Host "[dev-all] 啟動 Node 後端（port $nodePort）..."
    npm run dev
}
finally {
    Stop-EpistemicService
}
