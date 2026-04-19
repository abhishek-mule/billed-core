$ErrorActionPreference = "Stop"
Set-Location "C:\Users\HP\Desktop\mini_saas\mini_saas_frontend"
Start-Process -FilePath "C:\nvm4w\nodejs\node.exe" -ArgumentList ".\node_modules\next\dist\bin\next", "dev" -WindowStyle Hidden