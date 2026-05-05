#!/usr/bin/env bash
###############################################################################
# GitHub Branch Protection Setup — Freddie Mac SDLC Terminal
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated
#   - Admin access to the repository
#   - Repository org/name set below
#
# Usage:
#   chmod +x setup-branch-protection.sh
#   ./setup-branch-protection.sh
###############################################################################

set -euo pipefail

ORG="freddie-mac-engineering"        # ← Change to your GitHub org
REPO="sdlc-terminal"                  # ← Change to your repo name
JENKINS_CHECK="continuous-integration/jenkins/pr-merge"
SONAR_CHECK="sonarqube"

echo "🔒 Applying branch protection rules for ${ORG}/${REPO}..."

# ─── Protect: main ───────────────────────────────────────────────────────────
gh api repos/${ORG}/${REPO}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Branch Policy","Commit Policy","Code Quality","Unit Tests","'"${JENKINS_CHECK}"'","'"${SONAR_CHECK}"'"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":2,"dismiss_stale_reviews":true,"require_code_owner_review":true,"require_last_push_approval":true}' \
  --field restrictions='{"users":[],"teams":["release-managers","devops-leads"]}' \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_linear_history=false \
  --field required_conversation_resolution=true \
  --field lock_branch=false
echo "✅ main — protected"

# ─── Protect: develop ────────────────────────────────────────────────────────
gh api repos/${ORG}/${REPO}/branches/develop/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Branch Policy","Commit Policy","Code Quality","Unit Tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_review":false}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_conversation_resolution=true
echo "✅ develop — protected"

# ─── Protect: release/* ──────────────────────────────────────────────────────
gh api repos/${ORG}/${REPO}/branches/release%2F*/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Branch Policy","Commit Policy","Code Quality","Unit Tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":2,"dismiss_stale_reviews":true}' \
  --field allow_force_pushes=false \
  --field allow_deletions=false
echo "✅ release/* — protected"

echo ""
echo "🎉 Branch protection applied successfully."
echo ""
echo "Summary:"
echo "  main    — 2 reviewers required, admins enforced, restrict push to release-managers & devops-leads"
echo "  develop — 1 reviewer required, no direct push"
echo "  release/* — 2 reviewers required"
echo ""
echo "Next: Add CODEOWNERS file to enforce domain-specific reviews."
