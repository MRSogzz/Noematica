#!/usr/bin/env pwsh
# ============================================================
# pre-commit.ps1 — pre-commit.sample 的 PowerShell 版本（Windows 用）
#
# 效果：每次 commit 前，依序跑 Compiler（把已核准的草稿編譯進正式層）
# → Index Builder（重建 TSV 快照）→ Governance Auditor（重新掃描產生提案），
# 並把新產出的檔案一併加進這次 commit，讓「知識庫狀態」與「索引/提案」永遠同步。
#
# 安裝方式（Windows，需要 pwsh 在 PATH 上）：
#   Copy-Item pre-commit.ps1 .git\hooks\pre-commit
#   # 複製過去之後檔名要是 pre-commit（沒有副檔名），Git for Windows 內建的
#   # Git Bash 才會把它當成 hook 執行，並讀最上面這行 #!/usr/bin/env pwsh
#   # 決定要用 pwsh 當直譯器（前提是 pwsh 有裝、有在 PATH 上）。
#
# 如果不想處理這些細節，其實 Windows 上 Git Bash 直接執行原本的
# pre-commit.sample（bash 版，一樣 Copy-Item 成 .git\hooks\pre-commit）就會動，
# 不一定需要這份 PowerShell 版——這份主要是給偏好用 PowerShell 手動執行、
# 或想接 Windows 排程工作/CI 的情境。
# ============================================================

$ErrorActionPreference = 'Stop'

function Get-PythonCommand {
    foreach ($cmd in @('python3', 'python')) {
        if (Get-Command $cmd -ErrorAction SilentlyContinue) { return $cmd }
    }
    throw "找不到 python3 或 python，請先安裝 Python 並加入 PATH。"
}
$pythonCmd = Get-PythonCommand

$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

& $pythonCmd runtime/compiler/compiler.py $repoRoot
& $pythonCmd runtime/indexer/index_builder.py $repoRoot
& $pythonCmd runtime/policy/governance_auditor.py $repoRoot

# git add 的每個 glob 都個別執行，某個目錄底下剛好沒有檔案也不會讓整個 hook 失敗
# （對應 bash 版本 `2>/dev/null || true` 的容錯行為）
$patterns = @(
    'epistemic/.index/generated/*.tsv',
    'epistemic/1_Entities/*.md',
    'epistemic/2_Atoms/*.md',
    'epistemic/3_Observations/*.md',
    'epistemic/6_Rejected/*.md',
    'epistemic/0_Inbox/*.md',
    'epistemic/9_Blind_Spots/*.md'
)
foreach ($pattern in $patterns) {
    $files = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
    if ($files) {
        git add $pattern
    }
}
