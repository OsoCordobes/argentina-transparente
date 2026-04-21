$ErrorActionPreference = "Stop"

function Write-HookDecision([string]$decision, [string]$reason) {
  $out = @{
    hookSpecificOutput = @{
      hookEventName = "PreToolUse"
      permissionDecision = $decision
      permissionDecisionReason = $reason
    }
  } | ConvertTo-Json -Depth 6

  Write-Output $out
}

# Parse hook input defensively to determine whether current tool call is a git commit.
$rawInput = ""
if ([Console]::IsInputRedirected) {
  $rawInput = [Console]::In.ReadToEnd()
}
$hookInput = $null
if ($rawInput) {
  try { $hookInput = $rawInput | ConvertFrom-Json } catch { $hookInput = $null }
}

$toolName = ""
$toolCommand = ""
if ($hookInput) {
  if ($hookInput.toolName) { $toolName = [string]$hookInput.toolName }
  if (-not $toolName -and $hookInput.tool_name) { $toolName = [string]$hookInput.tool_name }

  if ($hookInput.toolInput -and $hookInput.toolInput.command) { $toolCommand = [string]$hookInput.toolInput.command }
  if (-not $toolCommand -and $hookInput.tool_input -and $hookInput.tool_input.command) { $toolCommand = [string]$hookInput.tool_input.command }
}

$isTerminalTool = ($toolName -match "run_in_terminal|execute")
$isGitCommit = ($toolCommand -match "(^|\s)git\s+commit(\s|$)")

if (-not ($isTerminalTool -and $isGitCommit)) {
  Write-HookDecision "allow" "Secret scan skipped (not a git commit tool call)"
  exit 0
}

$patterns = @(
  "sk-ant-[A-Za-z0-9_\-]+",
  "AKIA[0-9A-Z]{16}",
  "-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----",
  "(?i)anthropic_api_key\s*=\s*.+",
  "(?i)openai_api_key\s*=\s*.+",
  "(?i)api[_-]?key\s*[:=]\s*\S{16,}"
)

# Scan staged files only, so the hook blocks risky commits without interfering with normal workflows.
$stagedFiles = @(git diff --cached --name-only --diff-filter=ACMR 2>$null)
if (-not $stagedFiles -or $stagedFiles.Count -eq 0) {
  Write-HookDecision "allow" "No staged files to scan"
  exit 0
}

$hits = @()
foreach ($file in $stagedFiles) {
  if ([string]::IsNullOrWhiteSpace($file)) { continue }

  $content = ""
  try {
    $content = git show (":" + $file) 2>$null
  } catch {
    $content = ""
  }

  if (-not $content) { continue }

  foreach ($p in $patterns) {
    if ($content -match $p) {
      $hits += "Potential secret in staged file: $file (pattern: $p)"
      break
    }
  }
}

if ($hits.Count -gt 0) {
  $reason = "Secret scan blocked git commit.`n" + ($hits -join "`n")
  Write-HookDecision "deny" $reason
  exit 2
}

Write-HookDecision "allow" "No obvious secret patterns in staged files"
exit 0
