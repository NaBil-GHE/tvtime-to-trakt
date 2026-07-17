#!/usr/bin/env node

/**
 * Main entry point for TV Time → Trakt importer
 * Usage:
 *   node index.js                              # Run normal import
 *   node index.js --dry-run                    # Test without making changes
 *   node index.js --resume                     # Resume from last position
 *   node index.js --limit=100                  # Import first 100 rows
 *   node index.js --movie-only                 # Only import movies
 *   node index.js --episodes-only              # Only import episodes
 *   node index.js --cache-clear                # Clear cache before import
 *   node index.js --verbose                    # Verbose output
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { parseArgs } from './src/utils.js';
import { startOAuthFlow, validateTokens } from './src/auth.js';
import Importer from './src/importer.js';
import cache from './src/cache.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = 'tv-time-export.csv';

/**
 * Display help message
 */
function showHelp() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║         TV Time → Trakt Importer (Production)             ║
╠════════════════════════════════════════════════════════════╣
║ Import your TV Time watch history to Trakt                ║
╚════════════════════════════════════════════════════════════╝

USAGE:
  node index.js [OPTIONS]

OPTIONS:
  --help              Show this help message
  --auth              Start OAuth authentication flow
  --dry-run           Preview what would be imported without making changes
  --resume            Resume from the last interrupted position
  --limit=N           Import only first N rows (e.g., --limit=100)
  --movie-only        Import only movies
  --episodes-only     Import only episodes/shows
  --cache-clear       Clear cache before importing
  --verbose           Show detailed output for each item

EXAMPLES:
  # Normal import
  node index.js

  # Test import (dry run)
  node index.js --dry-run

  # Resume interrupted import
  node index.js --resume

  # Import only first 50 items
  node index.js --limit=50

  # Start authentication
  node index.js --auth

REQUIREMENTS:
  1. .env file with:
     - TRAKT_CLIENT_ID
     - TRAKT_CLIENT_SECRET
     - TRAKT_ACCESS_TOKEN (run with --auth first)

  2. tv-time-export.csv in project root

LOGS:
  - logs/success.json   - Successfully imported items
  - logs/skipped.json   - Skipped items with reasons
  - logs/failed.json    - Failed items with error details
  - cache/cache.json    - Persistent search cache
`);
}

/**
 * Main function
 */
async function main() {
    const args = parseArgs();

    // Handle help
    if (process.argv.includes('--help')) {
        showHelp();
        process.exit(0);
    }

    // Handle authentication
    if (process.argv.includes('--auth')) {
        console.log('Starting OAuth authentication...\n');
        try {
            const token = await startOAuthFlow();
            console.log('\nUpdate your .env file with:');
            console.log(`TRAKT_ACCESS_TOKEN=${token}\n`);
        } catch (error) {
            console.error('Authentication failed:', error.message);
            process.exit(1);
        }
        return;
    }

    // Validate tokens
    try {
        validateTokens();
    } catch (error) {
        console.error('Configuration error:', error.message);
        console.log('\nTo get started:');
        console.log('  1. Add TRAKT_CLIENT_ID and TRAKT_CLIENT_SECRET to .env');
        console.log('  2. Run: node index.js --auth');
        console.log('  3. Copy TRAKT_ACCESS_TOKEN to .env\n');
        process.exit(1);
    }

    // Handle cache clear
    if (args.cacheClear) {
        await cache.load();
        await cache.clear();
    }

    // Load cache
    if (!cache.loaded) {
        await cache.load();
    }

    // Create importer
    const importer = new Importer({
        dryRun: args.dryRun,
        verbose: args.verbose,
        limit: args.limit,
        movieOnly: args.movieOnly,
        episodesOnly: args.episodesOnly,
        resume: args.resume
    });

    // Show settings
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              Import Settings                             ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║ Dry Run:        ${String(args.dryRun ? 'YES' : 'NO').padEnd(50)} ║`);
    if (args.limit) {
        console.log(`║ Limit:          ${String(args.limit).padEnd(50)} ║`);
    }
    console.log(`║ Movie Only:     ${String(args.movieOnly ? 'YES' : 'NO').padEnd(50)} ║`);
    console.log(`║ Episodes Only:  ${String(args.episodesOnly ? 'YES' : 'NO').padEnd(50)} ║`);
    console.log(`║ Resume:         ${String(args.resume ? 'YES' : 'NO').padEnd(50)} ║`);
    console.log(`║ Verbose:        ${String(args.verbose ? 'YES' : 'NO').padEnd(50)} ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Run import
    try {
        await importer.run(CSV_PATH);
    } catch (error) {
        console.error('Import failed:', error.message);
        process.exit(1);
    }
}

// Run
main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
