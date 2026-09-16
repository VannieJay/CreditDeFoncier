<#
  Provisions the Credit De Foncier API on Render (free web service) via the Render REST API.
  Reads RENDER_API_KEY (process env, else USER-scope registry), prints the owning account email,
  creates/updates the web service from GitHub, pushes env vars read from backend/.env
  (values are NEVER printed), and attaches the custom domains.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\render-provision.ps1 -DryRun
    powershell -ExecutionPolicy Bypass -File scripts\render-provision.ps1
#>
[CmdletBinding()]
param(
  [string]$ServiceName = 'credit-de-foncier',
  [string]$Repo        = 'https://github.com/VannieJay/CreditDeFoncier',
  [string]$Branch      = 'main',
  [string]$RootDir     = 'backend',
  [string]$Region      = 'frankfurt',
  [string]$Plan        = 'free',
  [string[]]$Domains   = @('creditdefoncier.com','www.creditdefoncier.com'),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$script:Api = 'https://api.render.com/v1'
try { Start-Transcript -Path (Join-Path $env:TEMP 'cdf-render-provision.log') -Force | Out-Null } catch { }

function Get-RenderKey {
  $k = $env:RENDER_API_KEY
  if ($k) { $k = $k.Trim().Trim('"').Trim("'") }
  if ($k -eq 'PASTE_RENDER_API_KEY_HERE') { $k = $null }
  if (-not $k) {
    $k = [System.Environment]::GetEnvironmentVariable('RENDER_API_KEY','User')
    if ($k) { $k = $k.Trim().Trim('"').Trim("'") }
    if ($k -eq 'PASTE_RENDER_API_KEY_HERE') { $k = $null }
  }
  if (-not $k) {
    # Fallback: read backend/.env and accept either an rndr_ value (whatever the
    # variable is called there) or a RENDER-named variable. Names and lengths are
    # logged for diagnosis; the value itself is never printed.
    $envPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
    Write-Host ("DIAG      : scanning {0}" -f $envPath)
    if (Test-Path -LiteralPath $envPath) {
      $named = $null
      foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
          $n = $Matches[1]
          $v = $Matches[2].Trim().Trim('"').Trim("'")
          $hint = ''
          if ($v.StartsWith('rndr_')) { $hint = '  <-- rndr_ value' }
          if ($n -match 'RENDER') { $hint = $hint + '  <-- RENDER-named' }
          Write-Host ("DIAG      : {0,-22} len={1,3}{2}" -f $n, $v.Length, $hint)
          if ($v.StartsWith('rndr_') -and $v.Length -ge 20) { $k = $v; break }
          if ($n -match '^RENDER(_API)?_?(KEY|TOKEN)$' -and $v.Length -ge 20) { $named = $v }
        }
      }
      if (-not $k -and $named) { $k = $named; Write-Host 'DIAG      : using the RENDER-named variable from backend/.env' }
    }
  }
  if ($k) { $k = $k.Trim().Trim('"').Trim("'") }
  return $k
}

function Invoke-Render {
  param([string]$Method,[string]$Path,[object]$Body)
  $headers = @{ Accept = 'application/json'; Authorization = "Bearer $script:Key" }
  $uri = "$script:Api$Path"
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json -TimeoutSec 90
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -TimeoutSec 90
}

$script:Key = Get-RenderKey
if (-not $script:Key -or $script:Key.Length -lt 20) {
  Write-Host 'RENDER_API_KEY is not set (or still the placeholder).' -ForegroundColor Yellow
  Write-Host 'Save your key without echoing it:' -ForegroundColor Yellow
  Write-Host '  powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\set-render-key.ps1"' -ForegroundColor Cyan
  exit 1
}

# ---------- 1. account ----------
$me = Invoke-Render -Method GET -Path '/users'
$user = if ($me.user) { $me.user } else { $me }
Write-Host ("ACCOUNT   : {0} <{1}>" -f $user.name, $user.email) -ForegroundColor Green

# ---------- 2. workspace (ownerId) ----------
$owners = Invoke-Render -Method GET -Path '/owners'
$workspaces = @()
foreach ($o in $owners) { if ($o.owner) { $workspaces += $o.owner } else { $workspaces += $o } }
foreach ($w in $workspaces) { Write-Host ("WORKSPACE : {0} ({1}) type={2}" -f $w.name, $w.id, $w.type) }
$owner = ($workspaces | Where-Object { $_.type -eq 'user' } | Select-Object -First 1)
if (-not $owner) { $owner = $workspaces | Select-Object -First 1 }
if (-not $owner) { throw 'No workspace found for this API key.' }
Write-Host ("USING     : {0} ({1})" -f $owner.name, $owner.id) -ForegroundColor Green

# ---------- 3. env vars from backend/.env (never printed) ----------
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw "Missing $envFile" }
$dot = @{}
foreach ($line in Get-Content -LiteralPath $envFile) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $dot[$Matches[1]] = $Matches[2].Trim().Trim('"') }
}
function Val([string]$k,[string]$d) { if ($dot.ContainsKey($k) -and $dot[$k]) { return $dot[$k] } else { return $d } }
$envVars = @(
  @{ key = 'DATABASE_URL';          value = (Val 'DATABASE_URL' '') },
  @{ key = 'DB_SSL';                value = 'true' },
  @{ key = 'JWT_SECRET';            value = (Val 'JWT_SECRET' '') },
  @{ key = 'JWT_EXPIRES_IN';        value = (Val 'JWT_EXPIRES_IN' '1h') },
  @{ key = 'NODE_ENV';              value = 'production' },
  @{ key = 'CORS_ORIGINS';          value = 'https://creditdefoncier.com,https://www.creditdefoncier.com,https://cdfoncier.online' },
  @{ key = 'RATE_LIMIT_WINDOW_MS';  value = (Val 'RATE_LIMIT_WINDOW_MS' '60000') },
  @{ key = 'RATE_LIMIT_MAX';        value = (Val 'RATE_LIMIT_MAX' '100') },
  @{ key = 'SEED';                  value = 'false' }
)
if (-not $envVars[0].value -or -not $envVars[2].value) { throw 'DATABASE_URL / JWT_SECRET missing from backend/.env' }
Write-Host ("ENV VARS  : {0} keys staged from backend/.env (values hidden)" -f $envVars.Count) -ForegroundColor Green

# ---------- 4. existing service? ----------
$svc = $null
try {
  $list = Invoke-Render -Method GET -Path (" /services?name={0}" -f [uri]::EscapeDataString($ServiceName)).Trim()
  foreach ($item in $list) { if ($item.service -and $item.service.name -eq $ServiceName) { $svc = $item.service } }
} catch { Write-Host "lookup: $($_.Exception.Message)" -ForegroundColor DarkYellow }

if ($svc) {
  Write-Host ("SERVICE   : found existing {0} ({1})" -f $svc.name, $svc.id) -ForegroundColor Green
} else {
  Write-Host ("SERVICE   : will CREATE {0} in {1} ({2}, rootDir={3})" -f $ServiceName, $Region, $Plan, $RootDir) -ForegroundColor Yellow
}

if ($DryRun) { Write-Host 'DRY RUN - nothing was changed.' -ForegroundColor Cyan; exit 0 }

if (-not $svc) {
  $body = @{
    type      = 'web_service'
    name      = $ServiceName
    ownerId   = $owner.id
    repo      = $Repo
    branch    = $Branch
    rootDir   = $RootDir
    autoDeploy = 'yes'
    envVars   = $envVars
    serviceDetails = @{
      runtime         = 'node'
      plan            = $Plan
      region          = $Region
      healthCheckPath = '/health'
      envSpecificDetails = @{
        buildCommand = 'npm install'
        startCommand = 'npm start'
      }
    }
  }
  $created = Invoke-Render -Method POST -Path '/services' -Body $body
  $svc = if ($created.service) { $created.service } else { $created }
  Write-Host ("CREATED   : {0}" -f $svc.id) -ForegroundColor Green
}

# ---------- 5. push env vars (bulk replace) ----------
$null = Invoke-Render -Method PUT -Path ("/services/{0}/env-vars" -f $svc.id) -Body $envVars
Write-Host 'ENV VARS  : pushed to Render' -ForegroundColor Green

# ---------- 6. custom domains ----------
$cdPath = "/services/{0}/custom-domains" -f $svc.id
try {
  $existing = Invoke-Render -Method GET -Path $cdPath
} catch { $existing = @() }
$existingNames = @()
foreach ($e in $existing) { if ($e.customDomain) { $existingNames += $e.customDomain.name } elseif ($e.name) { $existingNames += $e.name } }

foreach ($d in $Domains) {
  if ($existingNames -contains $d) { Write-Host ("DOMAIN    : {0} already attached" -f $d) -ForegroundColor Green; continue }
  try {
    $res = Invoke-Render -Method POST -Path $cdPath -Body @{ name = $d }
    Write-Host ("DOMAIN    : attached {0}" -f $d) -ForegroundColor Green
    Write-Host ($res | ConvertTo-Json -Depth 8) -ForegroundColor DarkGray
  } catch {
    Write-Host ("DOMAIN    : could not attach {0} -> {1}" -f $d, $_.Exception.Message) -ForegroundColor Red
  }
}

# ---------- 7. summary ----------
$fresh = Invoke-Render -Method GET -Path ("/services/{0}" -f $svc.id)
$s = if ($fresh.service) { $fresh.service } else { $fresh }
Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ("Service   : {0}" -f $s.name)
Write-Host ("Service ID: {0}" -f $s.id)
Write-Host ("Dashboard : https://dashboard.render.com/web/{0}" -f $s.id)
if ($s.serviceDetails -and $s.serviceDetails.url) { Write-Host ("URL       : {0}" -f $s.serviceDetails.url) -ForegroundColor Green }
Write-Host ("Suspended : {0}" -f $s.suspended)
Write-Host 'Next: add the DNS records Cloudflare-side, then run:' -ForegroundColor Yellow
Write-Host ("  curl https://creditdefoncier.com/health") -ForegroundColor Yellow
Write-Host '================================================================' -ForegroundColor Cyan
try { Stop-Transcript | Out-Null } catch { }