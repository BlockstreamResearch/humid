#!/usr/bin/env bash
#
# Regenerates every rasterised icon from the SVG masters in assets/brand/.
# Run it after editing a master; the generated files are committed, so this is not part of the build.
#
#   brew install librsvg imagemagick
#   ./scripts/generate-icons.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

for bin in rsvg-convert magick; do
	command -v "$bin" >/dev/null || {
		echo "missing $bin — brew install librsvg imagemagick" >&2
		exit 1
	}
done

BRAND=assets/brand
ICON=$BRAND/humid-icon.svg
ICON_SMALL=$BRAND/humid-icon-small.svg
EXT=apps/extension/public/icon
WEB=apps/web/public
# Tile colour, kept in sync with the <rect> fill in the masters.
BG='#090F19'

png() { # png <svg> <size> <out>
	rsvg-convert -w "$2" -h "$2" -a "$1" -o "$3"
}

mkdir -p "$EXT" "$WEB"

# Extension: 16/32 come from the bubble-less optical variant, the rest from the full icon.
png "$ICON_SMALL" 16 "$EXT/16.png"
png "$ICON_SMALL" 32 "$EXT/32.png"
for size in 48 96 128; do
	png "$ICON" "$size" "$EXT/$size.png"
done

# Web: SVG favicon for modern browsers, .ico for the legacy/Google-crawler path.
cp "$ICON" "$WEB/favicon.svg"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
png "$ICON_SMALL" 16 "$tmp/16.png"
png "$ICON_SMALL" 32 "$tmp/32.png"
png "$ICON" 48 "$tmp/48.png"
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$WEB/favicon.ico"

png "$ICON" 192 "$WEB/icon-192.png"
png "$ICON" 512 "$WEB/icon-512.png"

# iOS re-masks apple-touch-icon itself and paints anything transparent black, so flatten the rounded
# corners onto the tile colour and hand it a full-bleed square.
png "$ICON" 180 "$tmp/180.png"
magick "$tmp/180.png" -background "$BG" -flatten -alpha off "$WEB/apple-touch-icon.png"

echo "generated:"
find "$EXT" "$WEB" -name '*.png' -o -name 'favicon.*' | sort | sed 's/^/  /'
