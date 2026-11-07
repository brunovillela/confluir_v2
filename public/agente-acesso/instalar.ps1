# Instalador do agente do controle de acesso — Confluir
#
# Clique com o botao direito neste arquivo e escolha "Executar com o PowerShell".
# Ele pede permissao de administrador, copia o agente para C:\ProgramData\Confluir,
# abre o assistente de pareamento e agenda o agente para iniciar com o Windows.
#
# Para remover: .\instalar.ps1 -Desinstalar

param([switch]$Desinstalar)

$ErrorActionPreference = "Stop"
$Tarefa = "Confluir - Agente de acesso"
$Pasta = Join-Path $env:ProgramData "Confluir"
$Agente = Join-Path $Pasta "agente-confluir.mjs"

function Pausar { Write-Host ""; Read-Host "Pressione Enter para fechar" | Out-Null }

# Administrador: o agente roda como servico do sistema e a pasta fica protegida.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($Desinstalar) { $argumentos += " -Desinstalar" }
  Start-Process powershell -Verb RunAs -ArgumentList $argumentos
  exit
}

if ($Desinstalar) {
  Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Tarefa -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Agente removido do inicio do Windows. A pasta $Pasta foi mantida (apague a mao se quiser)."
  Pausar
  exit
}

Write-Host "Agente do controle de acesso - Confluir" -ForegroundColor Cyan
Write-Host ""

# 1. Node.js 18 ou mais novo
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Falta o Node.js neste computador." -ForegroundColor Yellow
  Write-Host "Instale a versao LTS em https://nodejs.org (ou rode: winget install OpenJS.NodeJS.LTS)"
  Write-Host "e depois execute este instalador de novo."
  Pausar
  exit 1
}
$versao = (& node -p "process.versions.node").Trim()
if ([int]($versao.Split(".")[0]) -lt 18) {
  Write-Host "O Node.js instalado e a versao $versao; o agente precisa da 18 ou mais nova." -ForegroundColor Yellow
  Pausar
  exit 1
}
Write-Host "Node.js $versao encontrado."

# 2. Copiar o agente para a pasta protegida
$origem = Join-Path $PSScriptRoot "agente-confluir.mjs"
if (-not (Test-Path $origem)) {
  Write-Host "Nao achei agente-confluir.mjs ao lado deste instalador. Baixe os dois arquivos para a mesma pasta." -ForegroundColor Yellow
  Pausar
  exit 1
}
New-Item -ItemType Directory -Force -Path $Pasta | Out-Null
Copy-Item $origem $Agente -Force
# So administradores e o sistema leem a pasta: ela guarda o token do agente.
& icacls $Pasta /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
Write-Host "Agente copiado para $Pasta."

# 3. Assistente de pareamento (endereco do Confluir + codigo de 6 digitos)
Stop-ScheduledTask -TaskName $Tarefa -ErrorAction SilentlyContinue
& node $Agente parear
if ($LASTEXITCODE -ne 0) {
  Write-Host "O pareamento nao terminou. Gere um codigo novo no Confluir e execute o instalador de novo." -ForegroundColor Yellow
  Pausar
  exit 1
}

# 4. Iniciar com o Windows, como sistema, reiniciando se cair
$acao = New-ScheduledTaskAction -Execute $node.Source -Argument "`"$Agente`"" -WorkingDirectory $Pasta
$gatilho = New-ScheduledTaskTrigger -AtStartup
$usuario = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $Tarefa -Action $acao -Trigger $gatilho -Principal $usuario -Settings $ajustes -Force | Out-Null
Start-ScheduledTask -TaskName $Tarefa

Write-Host ""
Write-Host "Instalado. O agente ja esta rodando e vai iniciar sozinho com o Windows." -ForegroundColor Green
Write-Host "Registro em $Pasta\agente.log. Confira a lista de verificacao no Confluir."
Pausar
