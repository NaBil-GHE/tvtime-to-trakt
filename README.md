# TV Time → Trakt Importer

A production-ready Node.js CLI tool to migrate your **TV Time** watch history to **Trakt**.

This importer reads a TV Time CSV export, intelligently matches movies and TV episodes, and imports them into your Trakt account while preserving watch dates and avoiding duplicates.

---

## Features

- Import TV Time CSV exports
- Import TV episodes
- Import movies
- Preserve original watch timestamps (`watched_at`)
- Intelligent title matching
  - TVDB ID
  - TMDB ID
  - IMDb ID
  - Exact title
  - Fuzzy title
- Duplicate detection
- Persistent cache
- Resume interrupted imports
- Batch importing
- Automatic retry with exponential backoff
- Progress bar with ETA
- Detailed logs
- ES Modules
- Modern async architecture

---

## Requirements

- Node.js 18+
- Trakt account
- Trakt API application

---

## Installation

Clone the repository:

```bash
git clone https://github.com/<username>/tvtime-to-trakt.git
cd tvtime-to-trakt
```

Install dependencies:

```bash
npm install
```

---

## Create a Trakt Application

Go to:

https://trakt.tv/oauth/applications

Create a new application.

Example:

| Field | Value |
|-------|-------|
| Name | TV Time Importer |
| Redirect URI | http://localhost:3000/callback |
| Permissions | History |

Copy:

- Client ID
- Client Secret

---

## Configuration

Create a `.env` file.

```env
TRAKT_CLIENT_ID=
TRAKT_CLIENT_SECRET=
TRAKT_ACCESS_TOKEN=
```

---

## Authenticate

Run:

```bash
node index.js --auth
```

Your browser will open.

Authorize the application.

Your access token will be displayed.

Copy it into `.env`.

---

## Export TV Time Data

Export your watch history from TV Time.

Place the CSV file in the project root.

Example:

```
tv-time-export.csv
```

---

## Import

Import everything:

```bash
node index.js
```

---

## CLI Options

| Command | Description |
|----------|-------------|
| `--auth` | Authenticate with Trakt |
| `--dry-run` | Simulate import without uploading |
| `--resume` | Resume interrupted import |
| `--limit=100` | Import first N rows |
| `--movie-only` | Import only movies |
| `--episodes-only` | Import only episodes |
| `--verbose` | Detailed logging |
| `--cache-clear` | Clear search cache |
| `--help` | Show help |

---

## Matching Strategy

The importer searches using the following priority:

1. TVDB ID
2. TMDB ID
3. IMDb ID
4. Exact title
5. Title + year
6. Fuzzy title

Imports are skipped when confidence is too low.

---

## Duplicate Detection

Before importing, the importer checks your existing Trakt history.

Already imported items are skipped automatically.

---

## Resume Support

If the process stops unexpectedly:

```bash
node index.js --resume
```

Import continues from the last processed row.

---

## Cache

Search results are cached locally.

```
cache/
└── cache.json
```

This greatly reduces API requests.

---

## Logs

```
logs/
├── success.json
├── skipped.json
├── failed.json
└── not-found.csv
```

Each log contains detailed information about every processed item.

---

## Project Structure

```
.
├── cache/
├── logs/
├── src/
│   ├── auth.js
│   ├── cache.js
│   ├── importer.js
│   ├── search.js
│   ├── trakt.js
│   └── utils.js
├── tv-time-export.csv
├── index.js
├── package.json
└── .env
```

---

## Example Output

```
Loaded:        4946

Imported:      4872
Skipped:       58
Duplicates:    12
Failed:        4

Elapsed:       00:11:24
```

---

## Roadmap

- Import ratings
- Import reviews
- Import watchlists
- Parallel batch processing
- Support ZIP GDPR exports
- Support Simkl exports
- Support Letterboxd exports
- Support IMDb exports
- Interactive CLI
- Docker image

---

## Contributing

Pull requests, bug reports, and feature requests are welcome.

---

## Disclaimer

This project is an unofficial community tool.

TV Time and Trakt are trademarks of their respective owners.

---

## License

MIT