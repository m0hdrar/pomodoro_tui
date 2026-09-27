#!/usr/bin/env bash
# Usage: scripts/release.sh 0.2.0
# Builds macOS binaries, publishes a GitHub release, and bumps the Homebrew tap formula.
set -euo pipefail
VERSION="${1:?usage: scripts/release.sh <version>}"
REPO=m0hdrar/pomodoro_tui
TAP=m0hdrar/homebrew-tap

bun test
rm -rf dist && mkdir dist
for ARCH in arm64 x64; do
  bun build --compile --minify --target="bun-darwin-$ARCH" src/index.tsx --outfile dist/pomodoro
  tar -czf "dist/pomodoro-darwin-$ARCH.tar.gz" -C dist pomodoro
  rm dist/pomodoro
done
SHA_ARM=$(shasum -a 256 dist/pomodoro-darwin-arm64.tar.gz | cut -d' ' -f1)
SHA_X64=$(shasum -a 256 dist/pomodoro-darwin-x64.tar.gz | cut -d' ' -f1)

git tag "v$VERSION" && git push origin "v$VERSION"
gh release create "v$VERSION" dist/*.tar.gz --repo "$REPO" --title "v$VERSION" --generate-notes

TMP=$(mktemp -d)
gh repo clone "$TAP" "$TMP" -- -q
mkdir -p "$TMP/Formula"
cat > "$TMP/Formula/pomodoro.rb" <<RUBY
class Pomodoro < Formula
  desc "Keyboard-first terminal Pomodoro timer"
  homepage "https://github.com/$REPO"
  version "$VERSION"
  license "MIT"

  depends_on :macos

  on_arm do
    url "https://github.com/$REPO/releases/download/v$VERSION/pomodoro-darwin-arm64.tar.gz"
    sha256 "$SHA_ARM"
  end
  on_intel do
    url "https://github.com/$REPO/releases/download/v$VERSION/pomodoro-darwin-x64.tar.gz"
    sha256 "$SHA_X64"
  end

  def install
    bin.install "pomodoro"
  end

  test do
    assert_predicate bin/"pomodoro", :executable?
  end
end
RUBY
git -C "$TMP" add Formula/pomodoro.rb
git -C "$TMP" commit -qm "pomodoro $VERSION"
git -C "$TMP" push -q
echo "Released v$VERSION"
