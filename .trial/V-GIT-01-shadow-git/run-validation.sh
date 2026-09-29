#!/usr/bin/env bash
set -euo pipefail

trial_root="$(mktemp -d)"
trap 'rm -rf "$trial_root"' EXIT
source_root="$trial_root/source"
shadow_root="$trial_root/shadow.git"
mkdir -p "$source_root/nested" "$source_root/ignored"

git -C "$source_root" init -q
git -C "$source_root" config user.email trial@example.invalid
git -C "$source_root" config user.name Trial
printf 'tracked\n' > "$source_root/tracked.txt"
printf 'ignored/\n' > "$source_root/.gitignore"
git -C "$source_root" add tracked.txt .gitignore
git -C "$source_root" commit -qm initial
printf 'dirty\n' >> "$source_root/tracked.txt"
printf 'untracked\n' > "$source_root/untracked.txt"
printf 'ignored\n' > "$source_root/ignored/value.txt"
ln -s tracked.txt "$source_root/link.txt"

git -C "$source_root/nested" init -q
git -C "$source_root/nested" config user.email nested@example.invalid
git -C "$source_root/nested" config user.name Nested
printf 'nested\n' > "$source_root/nested/content.txt"
git -C "$source_root/nested" add content.txt
git -C "$source_root/nested" commit -qm nested

before_status="$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)"
before_head="$(git -C "$source_root" rev-parse HEAD)"
before_index="$(git -C "$source_root" hash-object .git/index)"

initial="$(node ./shadow-snapshot.mjs "$source_root" "$shadow_root")"
root_one="$(printf '%s' "$initial" | sed -E 's/.*"root_oid":"([^"]+)".*/\1/')"

after_status="$(git -C "$source_root" status --porcelain=v1 --untracked-files=all)"
after_head="$(git -C "$source_root" rev-parse HEAD)"
after_index="$(git -C "$source_root" hash-object .git/index)"

test "$before_status" = "$after_status"
test "$before_head" = "$after_head"
test "$before_index" = "$after_index"

tree_listing="$(git --git-dir "$shadow_root" ls-tree -r "$root_one")"
printf '%s\n' "$tree_listing" | grep -q $'100644 blob.*\tignored/value.txt'
printf '%s\n' "$tree_listing" | grep -q $'100644 blob.*\tnested/content.txt'
printf '%s\n' "$tree_listing" | grep -q $'120000 blob.*\tlink.txt'
if printf '%s\n' "$tree_listing" | grep -q '/.git/'; then
  echo 'FAIL: nested .git metadata leaked into snapshot' >&2
  exit 1
fi

printf 'changed\n' >> "$source_root/nested/content.txt"
incremental="$(node ./shadow-snapshot.mjs "$source_root" "$shadow_root" nested/content.txt)"
root_two="$(printf '%s' "$incremental" | sed -E 's/.*"root_oid":"([^"]+)".*/\1/')"
test "$root_one" != "$root_two"

printf 'PASS source_unchanged=true root_before=%s root_after=%s\n' "$root_one" "$root_two"
