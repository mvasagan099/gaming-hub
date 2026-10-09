# Agent Instructions & Direct-to-Main Git Workflow

This document defines permanent operational rules for all AI coding assistants (including Antigravity and OpenAI Codex) working in this repository.

---

## 1. Direct-to-Main Branching Model

1. **Always work directly on the `main` branch**:
   - The active branch for all development, bug fixes, features, and refactoring MUST be `main`.
   - **NEVER** create `codex/*`, `feature/*`, `staging/*`, `bugfix/*`, or any other temporary or working branches.
   - **NEVER** create GitHub Pull Requests.

2. **Continuous Integration & Auto-Deployment**:
   - Production services (API, Socket Server, and Static Frontend on Render) auto-deploy directly from the `main` branch on GitHub (`origin/main`).
   - Every verified push to `origin/main` triggers immediate automatic deployment.

---

## 2. Standard Development Lifecycle

Every task must strictly adhere to this linear workflow:

```
Inspect & Pull main ──▶ Implement ──▶ Test & Verify ──▶ Commit ──▶ Push to origin/main ──▶ Auto-Deploy
```

### Step 1: Pre-Execution Synchronization
Before making any changes:
1. Verify the current active branch is `main`:
   ```bash
   git branch --show-current
   ```
2. Check working tree status:
   ```bash
   git status
   ```
3. Safely synchronize with the upstream repository without rebase or squash:
   ```bash
   git pull --ff-only origin main
   ```
4. If uncommitted developer changes exist, preserve them. Never discard, reset, or overwrite unstaged work.

### Step 2: Implementation & Code Integrity
- Make only task-relevant edits.
- Maintain existing architecture, design patterns, comments, and docstrings.
- Preserve all existing tests and features.

### Step 3: Verification & Quality Gates
Before committing, all applicable verification steps must pass:
1. **Typecheck**:
   ```bash
   npm run typecheck
   ```
2. **Relevant Unit & Integration Tests**:
   ```bash
   npm test -w @gaming-hub/multiplayer
   npm test -w @gaming-hub/game-engine
   # or specific test files for the modified domain
   ```
3. **Production Build** (when modifying application code or dependencies):
   ```bash
   npm run build
   ```
*If any test, typecheck, or build fails, STOP immediately. Diagnose and resolve the issue before proceeding.*

### Step 4: Staging & Atomic Commits
1. Stage only files related to the task:
   ```bash
   git add <path/to/changed/files>
   ```
2. Commit with standard conventional commit messages:
   ```bash
   git commit -m "feat/fix/refactor/chore(scope): clear description of change"
   ```
3. **NEVER** commit `.env`, credentials, private keys, or build artifacts.

### Step 5: Direct Push to Origin Main
1. Push the commit directly to GitHub `main`:
   ```bash
   git push origin main
   ```
2. Confirm the push succeeded without errors.
3. Allow the connected deployment service (Render / web hosting) to build and deploy automatically.

---

## 3. Safety Invariants & Restrictions

- **NO FORCE PUSH**: Never use `git push --force`, `git push -f`, or `git push --force-with-lease`.
- **NO DESTRUCTIVE GIT OPS**: Never run `git reset --hard`, `git clean -fd`, or `git checkout -- .` without explicit user instruction.
- **NO CREDENTIAL LEAKS**: Never commit `.env*`, `.pem`, `.key`, or any live production/database secrets.
- **STOP ON BLOCKERS**: If a merge conflict, branch protection rule rejection, network failure, or test failure occurs, halt immediately and report the error to the user with actionable diagnostics.
