/**
 * Main import logic
 * Handles CSV parsing, duplicate detection, and error logging
 */

import fs from 'fs';
import csv from 'csv-parser';
import { createReadStream } from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import trakt from './trakt.js';
import cache from './cache.js';
import search from './search.js';
import { sleep, retry, validateCsvColumns, calculateEta, displayProgress } from './utils.js';

const LOGS_DIR = './logs';
const RESUME_FILE = path.join(LOGS_DIR, 'resume.json');

const REQUIRED_COLUMNS = [
    'type',
    'media_type',
    'title',
    'watched_at'
];

class Importer {
    constructor(options = {}) {
        this.options = {
            dryRun: false,
            verbose: false,
            limit: null,
            movieOnly: false,
            episodesOnly: false,
            resume: false,
            ...options
        };

        this.stats = {
            loaded: 0,
            imported: 0,
            skipped: 0,
            failed: 0,
            startTime: Date.now()
        };

        this.logs = {
            success: [],
            skipped: [],
            failed: []
        };

        this.lastProcessedIndex = 0;
        this.existingWatches = new Set();
    }

    /**
     * Validate CSV file before processing
     */
    async validateCsv(filePath) {
        return new Promise((resolve, reject) => {
            const rows = [];
            createReadStream(filePath)
                .pipe(csv())
                .on('data', row => rows.push(row))
                .on('end', () => {
                    try {
                        validateCsvColumns(rows, REQUIRED_COLUMNS);
                        resolve(rows);
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject);
        });
    }

    /**
     * Load existing watch history to prevent duplicates
     */
    async loadExistingHistory() {
        try {
            console.log('Loading existing watch history...');
            
            const shows = await trakt.getHistory({ limit: 300, type: 'shows' });
            const movies = await trakt.getHistory({ limit: 300, type: 'movies' });

            for (const item of shows) {
                if (item.show && item.episode) {
                    const key = `${item.show.ids.trakt}_S${item.episode.season}E${item.episode.number}`;
                    this.existingWatches.add(key);
                }
            }

            for (const item of movies) {
                if (item.movie) {
                    const key = `movie_${item.movie.ids.trakt}`;
                    this.existingWatches.add(key);
                }
            }

            console.log(`Loaded ${this.existingWatches.size} existing watches`);
        } catch (error) {
            console.error('Failed to load history:', error.message);
        }
    }

    /**
     * Check if item is already watched
     */
    isDuplicate(item, type) {
        if (type === 'show' && item.show) {
            const key = `${item.show.ids.trakt}_S${item.season}E${item.episode}`;
            return this.existingWatches.has(key);
        } else if (type === 'movie' && item.movie) {
            const key = `movie_${item.movie.ids.trakt}`;
            return this.existingWatches.has(key);
        }
        return false;
    }

    /**
     * Load resume state if available
     */
    async loadResumeState() {
        try {
            const content = await fsPromises.readFile(RESUME_FILE, 'utf-8');
            const state = JSON.parse(content);
            this.lastProcessedIndex = state.lastProcessedIndex || 0;
            console.log(`Resuming from index ${this.lastProcessedIndex}`);
        } catch (error) {
            // No resume file, start from beginning
        }
    }

    /**
     * Save resume state
     */
    async saveResumeState(index) {
        try {
            await fsPromises.mkdir(LOGS_DIR, { recursive: true });
            await fsPromises.writeFile(
                RESUME_FILE,
                JSON.stringify({ lastProcessedIndex: index + 1 }, null, 2)
            );
        } catch (error) {
            console.error('Failed to save resume state:', error.message);
        }
    }

    /**
     * Process a single row
     */
    async processRow(row, index) {
        const rowNum = index + 1;

        try {
            // Determine type
            if (row.type !== 'watch') {
                this.stats.skipped++;
                this.logs.skipped.push({
                    rowNumber: rowNum,
                    title: row.title,
                    season: row.season,
                    episode: row.episode,
                    watchedAt: row.watched_at,
                    reason: 'Type is not "watch"'
                });
                return;
            }

            // Filter by type if specified
            if (this.options.movieOnly && row.media_type !== 'movie') {
                this.stats.skipped++;
                this.logs.skipped.push({
                    rowNumber: rowNum,
                    title: row.title,
                    reason: 'Not a movie (--movie-only)'
                });
                return;
            }

            if (this.options.episodesOnly && row.media_type !== 'episode') {
                this.stats.skipped++;
                this.logs.skipped.push({
                    rowNumber: rowNum,
                    title: row.title,
                    reason: 'Not an episode (--episodes-only)'
                });
                return;
            }

            const isMovie = row.media_type === 'movie';
            const mediaType = isMovie ? 'movies' : 'shows';

            // Search for the item
            const item = await search.find(row, mediaType);

            if (!item) {
                this.stats.skipped++;
                this.logs.skipped.push({
                    rowNumber: rowNum,
                    title: row.title,
                    season: row.season,
                    episode: row.episode,
                    watchedAt: row.watched_at,
                    reason: 'Not found in Trakt database'
                });
                if (this.options.verbose) {
                    console.log(`✗ Not found: ${row.title}`);
                }
                return;
            }

            // Check for duplicates
            let isDuplicate = false;
            if (isMovie) {
                isDuplicate = this.existingWatches.has(`movie_${item.ids.trakt}`);
            } else {
                isDuplicate = this.existingWatches.has(
                    `${item.ids.trakt}_S${row.season}E${row.episode}`
                );
            }

            if (isDuplicate) {
                this.stats.skipped++;
                this.logs.skipped.push({
                    rowNumber: rowNum,
                    title: row.title,
                    season: row.season,
                    episode: row.episode,
                    watchedAt: row.watched_at,
                    reason: 'Already in watch history'
                });
                if (this.options.verbose) {
                    console.log(`⊘ Already watched: ${row.title}`);
                }
                return;
            }

            // Build payload
            const payload = this.buildPayload(row, item, isMovie);

            // Dry run: just log what would be done
            if (this.options.dryRun) {
                this.stats.imported++;
                const display = isMovie
                    ? row.title
                    : `${row.title} S${row.season}E${row.episode}`;
                console.log(`[DRY] ✓ Would import: ${display}`);
                this.logs.success.push({
                    rowNumber: rowNum,
                    title: row.title,
                    season: row.season,
                    episode: row.episode,
                    watchedAt: row.watched_at,
                    rating: row.rating || null
                });
                return;
            }

            // Actually import to Trakt
            await trakt.addToHistory(payload);

            // Add rating if provided
            if (row.rating) {
                const rating = parseInt(row.rating, 10);
                if (rating > 0 && rating <= 10) {
                    try {
                        await trakt.rateItem(
                            item.ids.trakt,
                            rating,
                            isMovie ? 'movie' : 'show'
                        );
                    } catch (error) {
                        console.error(`Failed to rate ${row.title}:`, error.message);
                    }
                }
            }

            this.stats.imported++;
            const display = isMovie
                ? row.title
                : `${row.title} S${row.season}E${row.episode}`;
            console.log(`✓ ${display}`);

            this.logs.success.push({
                rowNumber: rowNum,
                title: row.title,
                season: row.season,
                episode: row.episode,
                watchedAt: row.watched_at,
                rating: row.rating || null
            });

        } catch (error) {
            this.stats.failed++;
            const errorMsg = error.response?.data?.error || error.message;
            this.logs.failed.push({
                rowNumber: rowNum,
                title: row.title,
                season: row.season,
                episode: row.episode,
                watchedAt: row.watched_at,
                error: errorMsg
            });
            console.error(`✗ ${row.title}: ${errorMsg}`);
        }

        // Save resume state
        if (index % 10 === 0) {
            await this.saveResumeState(index);
        }
    }

    /**
     * Build Trakt sync payload
     */
    buildPayload(row, item, isMovie) {
        if (isMovie) {
            return {
                movies: [
                    {
                        ids: { trakt: item.ids.trakt },
                        watched_at: row.watched_at
                    }
                ]
            };
        } else {
            return {
                shows: [
                    {
                        ids: { trakt: item.ids.trakt },
                        seasons: [
                            {
                                number: Number(row.season),
                                episodes: [
                                    {
                                        number: Number(row.episode),
                                        watched_at: row.watched_at
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
        }
    }

    /**
     * Save logs to disk
     */
    async saveLogs() {
        try {
            await fsPromises.mkdir(LOGS_DIR, { recursive: true });

            if (this.logs.success.length > 0) {
                await fsPromises.writeFile(
                    path.join(LOGS_DIR, 'success.json'),
                    JSON.stringify(this.logs.success, null, 2)
                );
            }

            if (this.logs.skipped.length > 0) {
                await fsPromises.writeFile(
                    path.join(LOGS_DIR, 'skipped.json'),
                    JSON.stringify(this.logs.skipped, null, 2)
                );
            }

            if (this.logs.failed.length > 0) {
                await fsPromises.writeFile(
                    path.join(LOGS_DIR, 'failed.json'),
                    JSON.stringify(this.logs.failed, null, 2)
                );
            }

            console.log(`Logs saved to ${LOGS_DIR}/`);
        } catch (error) {
            console.error('Failed to save logs:', error.message);
        }
    }

    /**
     * Main import process
     */
    async run(csvPath) {
        console.log('Starting import...\n');

        // Validate CSV
        console.log('Validating CSV...');
        let rows;
        try {
            rows = await this.validateCsv(csvPath);
        } catch (error) {
            console.error('CSV validation failed:', error.message);
            return;
        }

        this.stats.loaded = rows.length;
        console.log(`Loaded ${rows.length} rows\n`);

        // Load cache
        await cache.load();

        // Load existing history for duplicate detection
        await this.loadExistingHistory();

        // Load resume state if requested
        if (this.options.resume) {
            await this.loadResumeState();
        } else {
            // Clear resume file
            try {
                await fsPromises.unlink(RESUME_FILE);
            } catch (error) {
                // File might not exist
            }
        }

        // Process rows
        const limit = this.options.limit || rows.length;
        const endIndex = Math.min(this.lastProcessedIndex + limit, rows.length);

        for (let i = this.lastProcessedIndex; i < endIndex; i++) {
            await this.processRow(rows[i], i);
            await sleep(350); // Rate limiting

            // Display progress
            if (i % 25 === 0) {
                displayProgress(
                    this.stats.loaded,
                    this.stats.imported,
                    this.stats.skipped,
                    this.stats.failed,
                    calculateEta(i - this.lastProcessedIndex + 1, limit, this.stats.startTime)
                );
            }
        }

        // Save cache
        await cache.save();

        // Save logs
        await this.saveLogs();

        // Final summary
        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║            IMPORT COMPLETED               ║');
        console.log('╠════════════════════════════════════════════╣');
        console.log(`║ Loaded:   ${String(this.stats.loaded).padEnd(35)} ║`);
        console.log(`║ Imported: ${String(this.stats.imported).padEnd(35)} ║`);
        console.log(`║ Skipped:  ${String(this.stats.skipped).padEnd(35)} ║`);
        console.log(`║ Failed:   ${String(this.stats.failed).padEnd(35)} ║`);
        console.log('╚════════════════════════════════════════════╝\n');
    }
}

export default Importer;
