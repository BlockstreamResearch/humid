# Brand assets

Masters — edit these, never the generated PNGs:

| File                   | What it is                                                     |
| ---------------------- | -------------------------------------------------------------- |
| `humid-logo.svg`       | Logo lockup as delivered by design (500×500 tile, `#090F19`)    |
| `humid-mark.svg`       | Mark alone, transparent background, tight viewBox               |
| `humid-icon.svg`       | App/extension icon — mark scaled to ~78% of the tile, for ≥48px |
| `humid-icon-small.svg` | 16/32px variant — bubbles dropped, bowl scaled to ~80%          |

Everything rasterised (`apps/extension/public/icon/*.png`, `apps/web/public/favicon.*`,
`apple-touch-icon.png`, `icon-{192,512}.png`) is generated and committed. Regenerate with:

```sh
brew install librsvg imagemagick
./scripts/generate-icons.sh
```
