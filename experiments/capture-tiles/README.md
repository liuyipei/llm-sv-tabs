# Capture Tiles Experiment

Minimal Electron app for capturing webpages as overlapping screenshot tiles suitable for LLM vision input.

## Features

- Vertical tiling screenshots with configurable overlap (10-20%)
- Fixed viewport capture (default 1440×900)
- Visible scrolling during capture for transparency
- Soft limits: warns at 20 tiles (then every 20), and at 32k estimated tokens
- Export to files or clipboard (JSON + images)

## Usage

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Build and run
npm start

# Run tests
npm test
```

## Capture Protocol

1. Enter URL and press Enter or click Go
2. Adjust settings (viewport, overlap) if needed
3. Click "Capture Tiles"
4. Watch the page scroll as tiles are captured
5. Review tiles in the gallery
6. Export to disk or clipboard

## Tile Metadata

Each tile includes:
- `tile_index` — 0-based index
- `tile_count` — total tiles in batch
- `scroll_y_px` — vertical scroll offset
- `viewport_px` — e.g., "1440x900"
- `overlap_ratio` — e.g., 0.15
- `capture_id` — unique batch ID
- `url` — source page URL
- `timestamp` — capture time
