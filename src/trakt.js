/**
 * Trakt API client with extended methods for syncing and history
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { retry } from './utils.js';

dotenv.config();

const client = axios.create({
    baseURL: 'https://api.trakt.tv',
    headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID,
        Authorization: `Bearer ${process.env.TRAKT_ACCESS_TOKEN}`
    }
});

class Trakt {
    /**
     * Generic GET request with retry logic
     */
    async get(endpoint, config = {}) {
        return retry(() => client.get(endpoint, config));
    }

    /**
     * Generic POST request with retry logic
     */
    async post(endpoint, data = {}, config = {}) {
        return retry(() => client.post(endpoint, data, config));
    }

    /**
     * Get current user's watch history
     * @param {Object} options - Pagination options
     * @returns {Promise<Array>} History items
     */
    async getHistory(options = {}) {
        const {
            limit = 10,
            extended = 'full',
            type = 'all' // 'shows', 'movies', or 'all'
        } = options;

        try {
            const response = await this.get('/sync/history', {
                params: {
                    limit,
                    extended,
                    type
                }
            });
            return response.data || [];
        } catch (error) {
            console.error('Failed to get history:', error.message);
            return [];
        }
    }

    /**
     * Search for a show
     * @param {string} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async searchShows(query, extended = 'full') {
        try {
            const response = await this.get('/search', {
                params: {
                    query,
                    type: 'show',
                    extended
                }
            });
            return response.data || [];
        } catch (error) {
            console.error(`Show search failed for "${query}":`, error.message);
            return [];
        }
    }

    /**
     * Search for a movie
     * @param {string} query - Search query
     * @returns {Promise<Array>} Search results
     */
    async searchMovies(query, extended = 'full') {
        try {
            const response = await this.get('/search', {
                params: {
                    query,
                    type: 'movie',
                    extended
                }
            });
            return response.data || [];
        } catch (error) {
            console.error(`Movie search failed for "${query}":`, error.message);
            return [];
        }
    }

    /**
     * Add episodes to watch history (sync/history endpoint)
     * @param {Object} payload - Sync payload
     * @returns {Promise<Object>} Sync response
     */
    async addToHistory(payload) {
        return this.post('/sync/history', payload);
    }

    /**
     * Batch add episodes to history
     * Uses /sync/history endpoint which accepts multiple shows/movies
     * @param {Array<Object>} items - Array of {type, traktId, season, episode, watchedAt}
     * @returns {Promise<Object>} Response
     */
    async batchAddToHistory(items) {
        const shows = [];
        const movies = [];

        for (const item of items) {
            if (item.type === 'show' || item.type === 'episode') {
                const show = shows.find(s => s.ids.trakt === item.traktId);
                if (show) {
                    if (!show.seasons[0]) show.seasons[0] = { number: item.season, episodes: [] };
                    show.seasons[0].episodes.push({
                        number: item.episode,
                        watched_at: item.watchedAt
                    });
                } else {
                    shows.push({
                        ids: { trakt: item.traktId },
                        seasons: [{
                            number: item.season,
                            episodes: [{
                                number: item.episode,
                                watched_at: item.watchedAt
                            }]
                        }]
                    });
                }
            } else if (item.type === 'movie') {
                movies.push({
                    ids: { trakt: item.traktId },
                    watched_at: item.watchedAt
                });
            }
        }

        const payload = {};
        if (shows.length > 0) payload.shows = shows;
        if (movies.length > 0) payload.movies = movies;

        return this.addToHistory(payload);
    }

    /**
     * Get show details including episodes
     * @param {number} traktId - Trakt show ID
     * @returns {Promise<Object>} Show data
     */
    async getShow(traktId, extended = 'full') {
        try {
            const response = await this.get(`/shows/${traktId}`, {
                params: { extended }
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to get show ${traktId}:`, error.message);
            return null;
        }
    }

    /**
     * Get movie details
     * @param {number} traktId - Trakt movie ID
     * @returns {Promise<Object>} Movie data
     */
    async getMovie(traktId, extended = 'full') {
        try {
            const response = await this.get(`/movies/${traktId}`, {
                params: { extended }
            });
            return response.data;
        } catch (error) {
            console.error(`Failed to get movie ${traktId}:`, error.message);
            return null;
        }
    }

    /**
     * Rate a show/season/episode
     * @param {number} traktId - Trakt ID
     * @param {number} rating - Rating 1-10 or 0 to remove
     * @param {string} type - 'show', 'season', or 'episode'
     * @returns {Promise<Object>} Response
     */
    async rateItem(traktId, rating, type = 'show') {
        try {
            const endpoint = type === 'episode' 
                ? '/sync/ratings/episodes'
                : type === 'show'
                ? '/sync/ratings/shows'
                : '/sync/ratings/movies';

            const payload = {
                [type === 'episode' ? 'episodes' : type === 'show' ? 'shows' : 'movies']: [
                    {
                        ids: { trakt: traktId },
                        rating
                    }
                ]
            };

            return this.post(endpoint, payload);
        } catch (error) {
            console.error(`Failed to rate ${type} ${traktId}:`, error.message);
            return null;
        }
    }

    /**
     * Check if show/movie exists in user's library
     * @param {number} traktId - Trakt ID
     * @param {string} type - 'shows' or 'movies'
     * @returns {Promise<boolean>}
     */
    async existsInLibrary(traktId, type = 'shows') {
        try {
            const response = await this.get(`/sync/${type}/collection`, {
                params: { extended: 'noseasons' }
            });
            return response.data.some(item => {
                const key = type === 'shows' ? 'show' : 'movie';
                return item[key].ids.trakt === traktId;
            });
        } catch (error) {
            console.error(`Failed to check library for ${traktId}:`, error.message);
            return false;
        }
    }
}

export default new Trakt();
