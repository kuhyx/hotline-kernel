#!/bin/bash

# ============================================================================
# Fail if any file exceeds the 250-line cap.
#
# A file that cannot be read in one piece forces re-reads and partial edits,
# which is the largest avoidable cost in an LLM-assisted workflow. The cap
# applies to code and prose alike; generated files, markup and data are exempt.
#
# Self-contained on purpose: the shared checker lives in ~/utils, which does
# not exist on a CI runner. This is the same rule, vendored so the gate runs
# identically in a commit hook and on push.
#
# Usage:
#   scripts/check-file-length.sh <file> [<file> ...]   # the hook passes these
#   scripts/check-file-length.sh --all                 # whole tree
# ============================================================================

set -euo pipefail

readonly MAX_LINES=250
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Markup and data are exempt: their length is not a comprehension cost.
is_exempt() {
    local file="$1"
    case "$file" in
        *.html|*.css|*.scss|*.json|*.yaml|*.yml|*.lock|*.svg) return 0 ;;
        *.g.ts|*.g.dart|*.freezed.dart) return 0 ;;
        package-lock.json) return 0 ;;
    esac
    head -n 5 "$file" 2>/dev/null | grep -q 'GENERATED' && return 0
    return 1
}

collect_all() {
    git -C "$REPO_ROOT" ls-files -z | tr '\0' '\n'
}

main() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $(basename "$0") <file>... | --all" >&2
        exit 1
    fi

    local files=()
    if [[ "$1" == "--all" ]]; then
        mapfile -t files < <(collect_all)
    else
        files=("$@")
    fi

    local violations=0
    for file in "${files[@]}"; do
        [[ -f "$REPO_ROOT/$file" ]] || [[ -f "$file" ]] || continue
        local path="$file"
        [[ -f "$path" ]] || path="$REPO_ROOT/$file"
        is_exempt "$path" && continue
        local lines
        lines=$(wc -l < "$path")
        if (( lines > MAX_LINES )); then
            printf '  %s: %d lines (over by %d)\n' \
                "$file" "$lines" "$(( lines - MAX_LINES ))" >&2
            violations=$(( violations + 1 ))
        fi
    done

    if (( violations > 0 )); then
        echo "" >&2
        echo "File-length gate FAILED: $violations file(s) over $MAX_LINES lines." >&2
        echo "Split them by concern; do not one-line or delete tests to fit." >&2
        exit 1
    fi
}

main "$@"
