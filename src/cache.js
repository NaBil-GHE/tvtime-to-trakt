/**
 * Persistent cache management for search results
 * Prevents redundant API calls for the same title
 */

import fs from 'fs/promises';
import path from 'path';

const CACHE_DIR = './cache';
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

class Cache {
    constructor() {
        this.data = {};
        this.loaded = false;
    }

    /**
     * Load cache from disk
     */
    async load() {
        try {
            const content = await fs.readFile(CACHE_FILE, 'utf-8');
            this.data = JSON.parse(content);
            this.loaded = true;
            console.log(`Cache loaded: ${Object.keys(this.data).length} entries`);
        } catch (error) {
            // Cache file doesn't exist yet, that's fine
            this.data = {};
            this.loaded = true;
        }
    }

    /**
     * Save cache to disk
     */
    async save() {
        try {
            await fs.mkdir(CACHE_DIR, { recursive: true });
            await fs.writeFile(CACHE_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save cache:', error.message);
        }
    }

    /**
     * Get cached result for a search query
     */
    get(key) {
        if (!this.loaded) {
            throw new Error('Cache not loaded. Call load() first.');
        }
        return this.data[key];
    }

    /**
     * Store result in cache
     */
    set(key, value) {
        if (!this.loaded) {
            throw new Error('Cache not loaded. Call load() first.');
        }
        this.data[key] = {
            ...value,
            cachedAt: new Date().toISOString()
        };
    }

    /**
     * Check if key exists in cache
     */
    has(key) {
        return key in this.data;
    }

    /**
     * Clear entire cache
     */
    async clear() {
        this.data = {};
        try {
            await fs.unlink(CACHE_FILE);
            console.log('Cache cleared');
        } catch (error) {
            // File might not exist
        }
    }

    /**
     * Get cache stats
     */
    getStats() {
        return {
            entries: Object.keys(this.data).length,
            size: JSON.stringify(this.data).length
        };
    }
}

export default new Cache();
