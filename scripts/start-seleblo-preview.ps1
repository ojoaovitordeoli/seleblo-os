$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$viteCli = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
# Endereço Tailscale deste PC: fica fora do repositório (variável SELEBLO_TAILSCALE_HOST
# ou o arquivo %LOCALAPPDATA%\SELEBLO-OS\tailscale-host.txt).
$hostname = $env:SELEBLO_TAILSCALE_HOST
$hostFile = Join-Path $env:LOCALAPPDATA 'SELEBLO-OS\tailscale-host.txt'
if (-not $hostname -and (Test-Path -LiteralPath $hostFile)) { $hostname = (Get-Content -LiteralPath $hostFile -Raw).Trim() }
$port = 4173
$dataDirectory = Join-Path $env:LOCALAPPDATA 'SELEBLO-OS'
$logPath = Join-Path $dataDirectory 'preview-startup.log'
$stdoutPath = Join-Path $dataDirectory 'preview.stdout.log'
$stderrPath = Join-Path $dataDirectory 'preview.stderr.log'

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null

function Write-StartupLog {
  param([string]$Message)
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

try {
  if (-not (Test-Path -LiteralPath $viteCli)) {
    throw "Vite nao encontrado em $viteCli."
  }
  if (-not (Test-Path -LiteralPath $node)) {
    throw "Node.js nao encontrado em $node."
  }

  $listeners = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $port -ErrorAction SilentlyContinue
  if ($listeners) {
    $viteProcesses = Get-CimInstance Win32_Process | Where-Object {
      $_.Name -eq 'node.exe' -and
      $_.CommandLine -like "*$viteCli*" -and
      $_.CommandLine -match 'preview.*127\.0\.0\.1.*4173'
    }
    if (-not $viteProcesses) {
      throw "A porta 127.0.0.1:$port esta ocupada por outro processo; nenhum servidor foi iniciado."
    }

    $existingApi = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/seleblo/index" -TimeoutSec 10
    if ($existingApi.status -ne 'ready') {
      throw "O preview existente respondeu, mas o indice esta em estado '$($existingApi.status)'."
    }

    Write-StartupLog "Preview já estava ativo (PID $($viteProcesses[0].ProcessId)); nenhuma instância duplicada foi iniciada."
    exit 0
  }

  $env:SELEBLO_TAILSCALE_HOST = $hostname
  $process = Start-Process -FilePath $node -ArgumentList @(
    $viteCli,
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    "$port"
  ) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 1
    $process.Refresh()
    if ($process.HasExited) {
      throw "O preview encerrou com código $($process.ExitCode). Consulte $stderrPath."
    }

    try {
      $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/seleblo/index" -TimeoutSec 3
      if ($status.status -eq 'ready') {
        Write-StartupLog "Preview iniciado (PID $($process.Id)); index ready with $($status.indexed) documents and $($status.relations) relations."
        exit 0
      }
    } catch {
      if ((Get-Date) -ge $deadline) {
        throw
      }
    }
  } while ((Get-Date) -lt $deadline)

  throw "O preview nao ficou pronto em 45 segundos. Consulte $stderrPath."
} catch {
  Write-StartupLog "ERRO: $($_.Exception.Message)"
  throw
}
