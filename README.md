# GridPoint — Location Format Explorer

A web application for converting between location formats and visualising points on an interactive map.

## Screenshot

![GridPoint Screenshot](docs/screenshot.png)

## Supported Formats

| Format | Input | Output |
|--------|-------|--------|
| Latitude/Longitude — Decimal Degrees | ✅ | ✅ |
| Latitude/Longitude — Degrees Minutes Seconds | ✅ | ✅ |
| Latitude/Longitude — Degrees Decimal Minutes | ✅ | ✅ |
| Maidenhead Grid Locator | ✅ | ✅ |
| UK Postcode | ✅ | — |
| Town / Place Name | ✅ | — |
| OS Grid Reference | ✅ | ✅ |
| WAB Square | ✅ | ✅ |
| Plus Code | ✅ | ✅ |

## Quick Start

### With Docker Compose (recommended)

```bash
docker-compose up --build
```

Then open http://localhost:8080

### With Docker directly

```bash
docker build -t gridpoint .
docker run -p 8080:8080 gridpoint
```

### To change the port

```bash
docker run -p 9000:8080 gridpoint
# then open http://localhost:9000
```

## Usage

**To locate a point:**
1. Select an input format from the dropdown
2. Enter the location value(s)
3. Press **LOCATE** or hit Enter

**To decode a map point:**
- Click anywhere on the map — all formats for that location appear in the sidebar

**To copy a format:**
- Click the ⧉ icon next to any result

## Notes

- OS Grid Reference, WAB Square conversions apply to Great Britain only
- UK Postcode lookup uses the free postcodes.io API
- Town/place lookup uses OpenStreetMap Nominatim
- Map tiles come from OpenStreetMap, Esri and OpenTopoMap; none require an API key

## Running Without Docker

```bash
cd app
python server.py
```

Requires Python 3.8+ — no additional packages needed.

## Author

Built by **James Marshall (M0LZN)** — [m0lzn.com](https://m0lzn.com)
