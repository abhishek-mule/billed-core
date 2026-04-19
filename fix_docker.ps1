$settings = Get-Content 'C:\Users\HP\AppData\Roaming\Docker\settings-store.json' | ConvertFrom-Json
$settings.IntegratedWslDistros = @()
$settings | ConvertTo-Json | Set-Content 'C:\Users\HP\AppData\Roaming\Docker\settings-store.json'
Write-Host "Cleared integrated distros"