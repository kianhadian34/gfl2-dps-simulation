<#
  ensure-node.ps1 - resolve (and if necessary install) a usable Node.js for the simulator UI.

  WHY THIS EXISTS
    The UI launcher runs `npm.cmd`, which ships WITH Node.js. On a machine without Node.js the
    launcher fails with an unhelpful "npm.cmd is not recognized" error, because there is no other
    way to obtain npm. This script removes that prerequisite: it reuses an existing Node.js, or
    downloads a PRIVATE PORTABLE copy for the current user - no admin rights, nothing installed
    system-wide, nothing added to the system PATH.

  RESOLUTION ORDER
    1. node.exe already on PATH with major version >= -RequiredMajor  -> use it.
    2. A previously bootstrapped private Node in the cache directory   -> reuse it.
    3. Download the official portable win-x64 / win-arm64 zip, verify its SHA-256 against
       nodejs.org's SHASUMS256.txt, and extract it into the cache directory.

  OUTPUT CONTRACT
    The resolved directory (containing node.exe + npm.cmd) is written to <cacheRoot>\node-dir.txt
    so the .bat launcher can prepend it to PATH. Exit code 0 = success, non-zero = failure.
#>
[CmdletBinding()]
param(
  [int]    $RequiredMajor = 22,
  [string] $Version,
  [string] $CacheRoot,
  [switch] $Force
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # PS 5.1 Invoke-WebRequest is far faster without it

function Info([string]$Message) { Write-Host "[node-setup] $Message" }

# Pin a known-good v22 LTS (the version the project targets); override with GFL2_NODE_VERSION.
if (-not $Version)   { $Version = if ($env:GFL2_NODE_VERSION) { $env:GFL2_NODE_VERSION } else { 'v22.23.3' } }
if (-not $CacheRoot) { $CacheRoot = Join-Path $env:LOCALAPPDATA 'gfl2-sim' }

$nodeDir = Join-Path $CacheRoot 'node'
$dirFile = Join-Path $CacheRoot 'node-dir.txt'

function Get-NodeMajor([string]$ExePath) {
  if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) { return -1 }
  try {
    $raw = & $ExePath --version 2>$null
    if ("$raw" -match '^v(\d+)\.') { return [int]$Matches[1] }
  } catch { }
  return -1
}

function Test-NodeDir([string]$Dir) {
  if (-not $Dir) { return $false }
  return (Test-Path -LiteralPath (Join-Path $Dir 'node.exe')) -and (Test-Path -LiteralPath (Join-Path $Dir 'npm.cmd'))
}

function Save-NodeDir([string]$Dir) {
  New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
  Set-Content -LiteralPath $dirFile -Value $Dir -Encoding ASCII
}

try {
  New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null

  # 1) An existing Node.js on PATH (normal developer machine).
  if (-not $Force) {
    $onPath = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($onPath) {
      $major = Get-NodeMajor $onPath.Source
      if ($major -ge $RequiredMajor) {
        $dir = Split-Path -Parent $onPath.Source
        Info "Using the Node.js already installed on this PC: $dir"
        Save-NodeDir $dir
        exit 0
      }
      Info "Found Node.js v$major, but this simulator needs v$RequiredMajor or newer."
    }
  }

  # 2) A previously bootstrapped private copy.
  if (-not $Force -and (Test-NodeDir $nodeDir)) {
    $major = Get-NodeMajor (Join-Path $nodeDir 'node.exe')
    if ($major -ge $RequiredMajor) {
      Info "Using the previously installed private Node.js: $nodeDir"
      Save-NodeDir $nodeDir
      exit 0
    }
    Info "The private Node.js copy is out of date (v$major); reinstalling."
  }

  # 3) Download the official portable build (per-user, no admin).
  $arch = switch ($env:PROCESSOR_ARCHITECTURE) { 'ARM64' { 'arm64' } default { 'x64' } }
  $name = "node-$Version-win-$arch"
  $base = "https://nodejs.org/dist/$Version"
  $zipUrl = "$base/$name.zip"

  Info "Node.js is needed to run the simulator UI. Installing a private copy (no admin needed)."
  Info "Downloading $zipUrl ..."

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("gfl2-node-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $zipPath = Join-Path $tmp "$name.zip"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing

    Info "Verifying the download (SHA-256)..."
    $sums = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content
    $line = @($sums -split "`n" | Where-Object { $_ -match [regex]::Escape("$name.zip") })[0]
    if (-not $line) { throw "could not find $name.zip in SHASUMS256.txt" }
    $expected = ($line.Trim() -split '\s+')[0].ToUpperInvariant()
    $actual = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $expected) { throw "SHA-256 mismatch for $name.zip (expected $expected, got $actual)" }

    Info "Extracting..."
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tmp -Force
    $inner = Join-Path $tmp $name
    if (-not (Test-NodeDir $inner)) { throw "the downloaded archive does not contain node.exe / npm.cmd" }
    if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
    Move-Item -LiteralPath $inner -Destination $nodeDir
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }

  if (-not (Test-NodeDir $nodeDir)) { throw "Node.js setup did not produce node.exe / npm.cmd in $nodeDir" }
  Info "Node.js installed to $nodeDir"
  Save-NodeDir $nodeDir
  exit 0
} catch {
  Write-Host "[node-setup] ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "[node-setup] You can also install Node.js manually from https://nodejs.org and re-run."
  exit 1
}
