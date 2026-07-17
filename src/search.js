/**
 * Title matching and search logic with priority matching
 * Priority: tvdb_id → tmdb_id → imdb_id → exact → fuzzy → year
 */

import cache from './cache.js';
import trakt from './trakt.js';
import { fuzzyMatchScore, normalizeTitle } from './utils.js';

const FUZZY_THRESHOLD = 0.75; // 75% match for fuzzy search

class Search {
    /**
     * Search for a show/movie with intelligent matching
     * @param {Object} row - CSV row data
     * @param {string} mediaType - 'shows' or 'movies'
     * @returns {Promise<Object>} Matched show/movie object or null
     */
    async find(row, mediaType = 'shows') {
        const cacheKey = this.getCacheKey(row, mediaType);

        // Check cache first
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            if (cached.notFound) return null;
            return cached.result;
        }

        // Try ID-based matching (highest priority)
        let result = null;

        if (row.tvdb_id) {
            result = await this.findByTvdbId(row.tvdb_id, mediaType);
        } else if (row.tmdb_id) {
            result = await this.findByTmdbId(row.tmdb_id, mediaType);
        } else if (row.imdb_id) {
            result = await this.findByImdbId(row.imdb_id, mediaType);
        }

        // Fall back to title-based search
        if (!result) {
            result = await this.searchByTitle(row.title, row.year, mediaType);
        }

        // Cache the result (even if not found)
        if (result) {
            cache.set(cacheKey, { result });
        } else {
            cache.set(cacheKey, { notFound: true });
        }

        return result;
    }

    /**
     * Find by TVDB ID
     */
    async findByTvdbId(tvdbId, mediaType) {
        try {
            const response = await trakt.get('/search', {
                params: {
                    query: tvdbId,
                    id_type: 'tvdb',
                    type: mediaType === 'shows' ? 'show' : 'movie'
                }
            });

            if (response.data && response.data.length > 0) {
                return response.data[0][mediaType === 'shows' ? 'show' : 'movie'];
            }
        } catch (error) {
            console.error(`TVDB lookup failed for ID ${tvdbId}:`, error.message);
        }
        return null;
    }

    /**
     * Find by TMDB ID
     */
    async findByTmdbId(tmdbId, mediaType) {
        try {
            const response = await trakt.get('/search', {
                params: {
                    query: tmdbId,
                    id_type: 'tmdb',
                    type: mediaType === 'shows' ? 'show' : 'movie'
                }
            });

            if (response.data && response.data.length > 0) {
                return response.data[0][mediaType === 'shows' ? 'show' : 'movie'];
            }
        } catch (error) {
            console.error(`TMDB lookup failed for ID ${tmdbId}:`, error.message);
        }
        return null;
    }

    /**
     * Find by IMDB ID
     */
    async findByImdbId(imdbId, mediaType) {
        try {
            const response = await trakt.get('/search', {
                params: {
                    query: imdbId,
                    id_type: 'imdb',
                    type: mediaType === 'shows' ? 'show' : 'movie'
                }
            });

            if (response.data && response.data.length > 0) {
                return response.data[0][mediaType === 'shows' ? 'show' : 'movie'];
            }
        } catch (error) {
            console.error(`IMDB lookup failed for ID ${imdbId}:`, error.message);
        }
        return null;
    }

    /**
     * Search by title with fallback strategies
     */
    async searchByTitle(title, year, mediaType) {
        try {
            // First try exact title search
            const response = await trakt.get('/search', {
                params: {
                    query: title,
                    type: mediaType === 'shows' ? 'show' : 'movie'
                }
            });

            if (!response.data || response.data.length === 0) {
                return null;
            }

            // Check for exact match first
            const item = mediaType === 'shows' ? 'show' : 'movie';
            const exactMatch = response.data.find(result => {
                const resultTitle = result[item].title.toLowerCase();
                const searchTitle = title.toLowerCase();
                return resultTitle === searchTitle;
            });

            if (exactMatch) {
                return exactMatch[item];
            }

            // Try fuzzy matching with score threshold
            let bestMatch = null;
            let bestScore = 0;

            for (const result of response.data) {
                const score = fuzzyMatchScore(result[item].title, title);
                if (score > bestScore && score >= FUZZY_THRESHOLD) {
                    bestScore = score;
                    bestMatch = result[item];
                }
            }

            if (bestMatch) {
                return bestMatch;
            }

            // Last resort: first result if confidence isn't too low
            const firstResult = response.data[0][item];
            const score = fuzzyMatchScore(firstResult.title, title);
            if (score >= FUZZY_THRESHOLD) {
                return firstResult;
            }

        } catch (error) {
            console.error(`Title search failed for "${title}":`, error.message);
        }

        return null;
    }

    /**
     * Generate cache key for a row
     */
    getCacheKey(row, mediaType) {
        if (row.tvdb_id) return `tvdb_${row.tvdb_id}`;
        if (row.tmdb_id) return `tmdb_${row.tmdb_id}`;
        if (row.imdb_id) return `imdb_${row.imdb_id}`;
        return `${mediaType}_${normalizeTitle(row.title)}_${row.year || 'unknown'}`;
    }

    /**
     * Validate match confidence (0-1, higher is better)
     */
    validateMatch(resultTitle, queryTitle) {
        return fuzzyMatchScore(resultTitle, queryTitle) >= FUZZY_THRESHOLD;
    }
}

export default new Search();
