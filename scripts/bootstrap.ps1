$ErrorActionPreference = "Stop"

Write-Host "Bootstrapping CONTENT ENGINE X"
pnpm install
Push-Location services/orchestrator
python -m pip install -e .
Pop-Location
Write-Host "Bootstrap complete"
