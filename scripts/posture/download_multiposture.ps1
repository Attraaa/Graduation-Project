param([string]$Destination = (Join-Path $PSScriptRoot '../../reports/posture-augmentation/data'))
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$expected = 'd21579200db9a57dd01c24fa6ece961b0be73aa0d5d402ae8e629761c03ebe38'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$target = Join-Path $Destination 'multiposture.csv'
if (-not (Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $expected) {
    $temporary = Join-Path $Destination 'multiposture.csv.download'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://zenodo.org/records/14230872/files/data.csv?download=1' -OutFile $temporary -TimeoutSec 120
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $expected) {
        throw 'Dataset revision differs. Inspect the downloaded file before training; existing data was not overwritten.'
    }
    Move-Item -LiteralPath $temporary -Destination $target -Force
}
$metadata = Invoke-RestMethod -Uri 'https://zenodo.org/api/records/14230872' -TimeoutSec 60
if ($metadata.metadata.license.id -ne 'cc-by-4.0') { throw 'License metadata changed; review reuse conditions.' }
$metadata | ConvertTo-Json -Depth 25 | Set-Content -LiteralPath (Join-Path $Destination 'source-metadata.json') -Encoding UTF8
Write-Host "Verified MultiPosture data: $target (CC BY 4.0)"
