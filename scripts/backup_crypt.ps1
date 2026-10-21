# PowerRun Industries - encrypt / decrypt a database backup file.
#
#   powershell -File scripts\backup_crypt.ps1 -Mode Encrypt -In data.json.gz -Out data.prb -KeyFile key.txt
#   powershell -File scripts\backup_crypt.ps1 -Mode Decrypt -In data.prb    -Out data.json.gz -KeyFile key.txt
#   powershell -File scripts\backup_crypt.ps1 -Mode NewKey -KeyFile key.txt
#
# AES-256-CBC with an HMAC-SHA256 tag over IV + ciphertext (encrypt-then-MAC), using
# only .NET classes built into Windows - nothing to install. The key file holds 32
# random bytes (base64). Keep a copy of it somewhere other than this PC: without it
# a backup cannot be opened.
#
# File format: "PRB1" (4 bytes) | IV (16) | ciphertext | HMAC-SHA256 tag (32)
param(
  [Parameter(Mandatory = $true)][ValidateSet('Encrypt', 'Decrypt', 'NewKey')][string]$Mode,
  [string]$In,
  [string]$Out,
  [Parameter(Mandatory = $true)][string]$KeyFile
)
$ErrorActionPreference = 'Stop'

function Get-SubKey([byte[]]$master, [string]$label) {
  $h = New-Object System.Security.Cryptography.HMACSHA256 (, $master)
  try { return $h.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($label)) } finally { $h.Dispose() }
}

if ($Mode -eq 'NewKey') {
  if (Test-Path $KeyFile) { throw "Key file already exists: $KeyFile" }
  $k = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($k)
  [System.IO.File]::WriteAllText($KeyFile, [Convert]::ToBase64String($k))
  Write-Output "new key written"
  exit 0
}

$master = [Convert]::FromBase64String(([System.IO.File]::ReadAllText($KeyFile)).Trim())
if ($master.Length -ne 32) { throw 'Key file must hold 32 bytes (base64).' }
$encKey = Get-SubKey $master 'powerrun-backup-enc'
$macKey = Get-SubKey $master 'powerrun-backup-mac'
$magic = [System.Text.Encoding]::ASCII.GetBytes('PRB1')

$aes = [System.Security.Cryptography.Aes]::Create()
$aes.KeySize = 256; $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.Key = $encKey
$hmac = New-Object System.Security.Cryptography.HMACSHA256 (, $macKey)

if ($Mode -eq 'Encrypt') {
  $plain = [System.IO.File]::ReadAllBytes($In)
  $aes.GenerateIV()
  $cipher = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)
  $body = $aes.IV + $cipher
  $tag = $hmac.ComputeHash($body)
  [System.IO.File]::WriteAllBytes($Out, $magic + $body + $tag)
  Write-Output ("encrypted {0} bytes" -f $plain.Length)
} else {
  $all = [System.IO.File]::ReadAllBytes($In)
  if ($all.Length -lt 52 -or [System.Text.Encoding]::ASCII.GetString($all, 0, 4) -ne 'PRB1') { throw 'Not a PowerRun backup file.' }
  $body = $all[4..($all.Length - 33)]
  $tag = $all[($all.Length - 32)..($all.Length - 1)]
  $calc = $hmac.ComputeHash([byte[]]$body)
  $diff = 0; for ($i = 0; $i -lt 32; $i++) { $diff = $diff -bor ($calc[$i] -bxor $tag[$i]) }
  if ($diff -ne 0) { throw 'Backup file is damaged or the key is wrong (HMAC check failed).' }
  $aes.IV = [byte[]]$body[0..15]
  $cipher = [byte[]]$body[16..($body.Length - 1)]
  $plain = $aes.CreateDecryptor().TransformFinalBlock($cipher, 0, $cipher.Length)
  [System.IO.File]::WriteAllBytes($Out, $plain)
  Write-Output ("decrypted {0} bytes" -f $plain.Length)
}
