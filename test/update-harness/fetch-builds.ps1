<#
.SYNOPSIS
  Downloads the already-signed v1.1.0 and v1.1.1 release assets (installer +
  latest.yml) into ./feed/<version>/ so they can be served locally by serve.mjs.
.NOTES
  v1.1.0 has the OLD lowercase app-update.yml baked in (the bug); v1.1.1 has the
  FIXED capital-K one. That pairing is what gives the harness a pass/fail control.
#>
param([string]$Repo = 'lkongswa/pocketchart', [string[]]$Versions = @('1.1.0', '1.1.1'))

$root = Join-Path $PSScriptRoot 'feed'
foreach ($v in $Versions) {
  $dest = Join-Path $root $v
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Write-Host "Downloading v$v assets -> $dest"
  gh release download "v$v" --repo $Repo --pattern "*.exe" --pattern "latest.yml" --dir $dest --clobber
}
Write-Host ""
Write-Host "Done. Next: serve one version, e.g."
Write-Host "    node serve.mjs ./feed/1.1.0 8080"
