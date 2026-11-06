# OpenAI API 키 등록 스크립트
# 사용법: OpenAI 사이트에서 키를 복사(Ctrl+C)한 뒤 실행
#   pwsh -File scripts/set-openai-key.ps1            (등록 + 운영 재배포)
#   pwsh -File scripts/set-openai-key.ps1 -NoDeploy  (등록만)
# 하는 일: 키 유효성 검사 → .env.local 갱신 → Vercel(Production/Preview) 교체 → 재배포 → 동작 확인
# 키는 화면에 출력하지 않으며, 끝나면 클립보드를 비운다.
param([switch]$NoDeploy)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# 1. 클립보드에서 키 읽기
Step "클립보드에서 키 읽기"
$key = (Get-Clipboard -Raw) -replace '\s', ''
$key = $key.Trim('"', "'")
if (-not $key.StartsWith("sk-")) { Fail "클립보드에 sk- 로 시작하는 키가 없습니다. OpenAI 사이트에서 키를 복사(Ctrl+C)한 뒤 다시 실행하세요." }
Ok "키 확인 ($($key.Substring(0,8))… / $($key.Length)자)"

# 2. OpenAI에 실제로 유효한지 확인
Step "OpenAI 키 유효성 검사"
try {
  Invoke-RestMethod -Uri "https://api.openai.com/v1/models" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 30 | Out-Null
  Ok "유효한 키입니다"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 401) { Fail "OpenAI가 키를 거부했습니다(401). 키를 끝까지 복사했는지 확인하세요." }
  Fail "검사 실패 (응답 코드: $code) $($_.Exception.Message)"
}

# 3. .env.local 갱신 (다른 줄은 그대로 유지)
Step ".env.local 갱신"
$envFile = Join-Path $root ".env.local"
$lines = if (Test-Path $envFile) { @(Get-Content $envFile | Where-Object { $_ -notmatch '^\s*OPENAI_API_KEY=' }) } else { @() }
$lines = @("OPENAI_API_KEY=$key") + $lines
[IO.File]::WriteAllText($envFile, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Ok "저장 완료"

# 4. Vercel 환경변수 교체
Step "Vercel 환경변수 교체 (Production, Preview)"
$tmp = [IO.Path]::GetTempFileName()
try {
  [IO.File]::WriteAllText($tmp, $key, [Text.UTF8Encoding]::new($false))
  foreach ($target in "production", "preview") {
    vercel env rm OPENAI_API_KEY $target -y 2>&1 | Out-Null
    cmd /c "vercel env add OPENAI_API_KEY $target --sensitive < `"$tmp`"" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "$target 등록 실패. 'vercel login' 상태를 확인하세요." }
    Ok "$target 등록"
  }
} finally {
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

# 클립보드 비우기
Set-Clipboard -Value " "
Ok "클립보드 비움"

if ($NoDeploy) { Write-Host "`n완료. 재배포는 하지 않았습니다(-NoDeploy)." -ForegroundColor Yellow; exit 0 }

# 5. 운영 재배포 (현재 운영 배포를 그대로 다시 빌드)
Step "운영 사이트 재배포"
$list = vercel ls --environment production 2>&1 | Out-String
$m = [regex]::Match($list, 'https://trace-to-[a-z0-9]+-[a-z0-9-]+\.vercel\.app')
if (-not $m.Success) { Fail "현재 운영 배포 주소를 찾지 못했습니다." }
vercel redeploy $m.Value 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "재배포 실패. Vercel 대시보드에서 Redeploy 하세요." }
Ok "재배포 완료 → https://trace-to-fix.vercel.app"

# 6. 실제 동작 확인
Step "AI 기능 동작 확인"
try {
  $body = @{ text = "B/L 컨테이너 번호가 인보이스와 달라 반려합니다" } | ConvertTo-Json
  $res = Invoke-RestMethod -Method Post -Uri "https://trace-to-fix.vercel.app/api/ai/classify-reason" `
    -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 60
  Ok "정상 동작합니다"
  $res | ConvertTo-Json -Depth 5 | Write-Host
} catch {
  Write-Host "  ✗ 호출 실패: $($_.ErrorDetails.Message)" -ForegroundColor Red
  exit 1
}
Write-Host "`n모두 완료!" -ForegroundColor Green
