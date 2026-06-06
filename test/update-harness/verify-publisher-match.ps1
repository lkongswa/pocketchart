<#
.SYNOPSIS
  Fails (exit 1) if a signed installer's certificate CN does not EXACTLY
  (case-sensitively) match the publisherName in the generated app-update.yml.

.DESCRIPTION
  This guards the exact bug that silently broke auto-update across v1.0.x-v1.1.0:
  electron-updater's Windows publisher check is CASE-SENSITIVE, so any casing
  drift between azureSignOptions.publisherName (which feeds app-update.yml) and
  the Azure Trusted Signing cert subject ('CN=Lyda Kongswangwongsa') makes every
  future update get rejected as "not signed by the application owner".

  Run in CI right after signing (before publishing) so a mismatch can never ship.

.EXAMPLE
  ./verify-publisher-match.ps1 -ExePath release/PocketChart-Setup-1.2.0.exe `
                               -YmlPath release/win-unpacked/resources/app-update.yml
#>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [Parameter(Mandatory = $true)][string]$YmlPath
)

if (-not (Test-Path $ExePath)) { Write-Error "Installer not found: $ExePath"; exit 1 }
if (-not (Test-Path $YmlPath)) { Write-Error "app-update.yml not found: $YmlPath"; exit 1 }

# --- 1. Certificate CN from the signed installer ---
$sig = Get-AuthenticodeSignature $ExePath
if ($sig.Status -ne 'Valid') {
  Write-Error "Installer is not validly signed (Status=$($sig.Status)): $ExePath"; exit 1
}
$subject = $sig.SignerCertificate.Subject          # e.g. 'CN=Lyda Kongswangwongsa, O=..., C=US'
if ($subject -notmatch 'CN=([^,]+)') {
  Write-Error "Could not parse CN from certificate subject: $subject"; exit 1
}
$certCN = $Matches[1].Trim()

# --- 2. publisherName list from app-update.yml (handles scalar or YAML list) ---
$lines = Get-Content $YmlPath
$names = @()
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^\s*publisherName:\s*(\S.*?)?\s*$') {
    $inline = $Matches[1]
    if ($inline) {
      $names += $inline.Trim().Trim('"').Trim("'")
    } else {
      for ($j = $i + 1; $j -lt $lines.Count; $j++) {
        if ($lines[$j] -match '^\s*-\s*(.+\S)\s*$') { $names += $Matches[1].Trim().Trim('"').Trim("'") }
        elseif ($lines[$j] -match '^\s*$') { continue }
        else { break }
      }
    }
    break
  }
}
if ($names.Count -eq 0) {
  Write-Error "No publisherName found in $YmlPath - electron-updater would have nothing to verify against."; exit 1
}

# --- 3. Case-SENSITIVE comparison (this is what electron-updater does) ---
Write-Host "Cert CN (signed installer): '$certCN'"
Write-Host ("app-update.yml publisherName: " + (($names | ForEach-Object { "'$_'" }) -join ', '))

if ($names -ccontains $certCN) {
  Write-Host "OK - publisher names match case-sensitively. Auto-update signature check will pass."
  exit 0
} else {
  Write-Error ("PUBLISHER MISMATCH - this WILL break auto-update. The cert CN must appear " +
               "verbatim (case-sensitive) in app-update.yml publisherName. Set " +
               "azureSignOptions.publisherName in package.json to exactly '$certCN'.")
  exit 1
}
