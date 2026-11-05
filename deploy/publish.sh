#!/usr/bin/env bash
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
if [[ $(git branch --show-current) != main ]]; then
  echo '发布必须从 main 执行。' >&2
  exit 1
fi

revision=$(git rev-parse HEAD)
verify_remote_main() {
  local upstream
  upstream=$(git ls-remote --exit-code origin refs/heads/main) || return 1
  if [[ ${upstream%%$'\t'*} != "$revision" ]]; then
    echo '待发布提交与 origin/main 不一致。' >&2
    return 1
  fi
}

verify_remote_main
build=$(mktemp -d "${TMPDIR:-/tmp}/wallbait-build.XXXXXXXX")
trap 'rm -rf -- "$build"' EXIT

git archive "$revision" | tar -xf - -C "$build"
(
  cd "$build"
  npm ci
  npm run check
)
verify_remote_main

install_release=$(cat <<'REMOTE'
set -eu
cd /home/hahaen/game/wallbait
exec 9>.publish.lock
flock -x 9
if [ -e dist ] && [ ! -L dist ]; then
  echo 'dist 已存在且不是发布链接。' >&2
  exit 1
fi

previous=$(readlink dist || true)
stage=$(mktemp -d "releases/release-$revision.XXXXXXXX")
trap 'rm -rf -- "$stage" "$stage.link"' EXIT
tar --extract --gzip --no-same-owner --no-same-permissions --directory="$stage"
test -s "$stage/index.html"
test -d "$stage/assets"
chmod 755 "$stage"
ln -s "$stage" "$stage.link"
mv -Tf "$stage.link" dist
trap - EXIT

# 保留本次和上次产物，以便需要时回滚。
for directory in releases/release-*; do
  if [ -d "$directory" ] && [ "$directory" != "$stage" ] && [ "$directory" != "$previous" ]; then
    rm -rf -- "$directory"
  fi
done
REMOTE
)

COPYFILE_DISABLE=1 tar -czf - -C "$build/dist" . |
  ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
    hahaen-server "revision='$revision'; $install_release"

url=https://hahaen.xyz/game/wallbait
download="$build/.published"
curl --fail --silent --show-error --location --max-time 30 "$url" --output "$download"
cmp "$build/dist/index.html" "$download"
while IFS= read -r -d '' file; do
  relative=${file#"$build/dist/"}
  curl --fail --silent --show-error --max-time 30 "$url/$relative" --output "$download"
  cmp "$file" "$download"
done < <(find "$build/dist/assets" -type f -print0)

printf '发布成功 %s %s\n' "$revision" "$url"
