#!/usr/bin/env bash
# Spawn SDLC molecules for all feature beads under the v2 epic.
# Each feature gets: .1 impl → .2 review → .3 qa → .4 pr
# Implementation is already done, so .1 is immediately closed.

set -euo pipefail

FEATURES=(
  ScaledTest-g7e
  ScaledTest-sds
  ScaledTest-6mk
  ScaledTest-c8b
  ScaledTest-bde
  ScaledTest-pvu
  ScaledTest-7uk
  ScaledTest-uo6
  ScaledTest-tkz
  ScaledTest-7po
  ScaledTest-6ve
  ScaledTest-fai
  ScaledTest-dg6
  ScaledTest-as0
  ScaledTest-tph
  ScaledTest-9gq
  ScaledTest-0f8
  ScaledTest-2ft
  ScaledTest-39v
  ScaledTest-gc0
)

for parent in "${FEATURES[@]}"; do
  title=$(bd show "$parent" 2>/dev/null | head -1 | sed 's/^[^ ]* · //' | sed 's/  *\[.*//')
  echo "=== Spawning molecule for $parent: $title ==="

  # Create .1 impl
  impl_id=$(bd q "impl: $title" --parent "$parent" --type task -l stage:impl -p 1 2>/dev/null)
  echo "  .1 impl: $impl_id"

  # Create .2 review (depends on .1)
  review_id=$(bd q "review: $title" --parent "$parent" --type task -l stage:review -p 1 --deps "$impl_id" 2>/dev/null)
  echo "  .2 review: $review_id"

  # Create .3 qa (depends on .2)
  qa_id=$(bd q "qa: $title" --parent "$parent" --type task -l stage:qa -p 1 --deps "$review_id" 2>/dev/null)
  echo "  .3 qa: $qa_id"

  # Create .4 pr (depends on .3)
  pr_id=$(bd q "pr: $title" --parent "$parent" --type task -l stage:pr -p 1 --deps "$qa_id" 2>/dev/null)
  echo "  .4 pr: $pr_id"

  # Close .1 impl since implementation is already done
  bd close "$impl_id" 2>/dev/null
  echo "  Closed $impl_id (impl done)"

  echo ""
done

echo "All molecules spawned."
