/**
 * Utility functions for TV Time → Trakt importer
 */

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of function
 */
export async function retry(fn, options = {}) {
    const {
        maxAttempts = 3,
        baseDelay = 1000,
        maxDelay = 30000,
        backoffMultiplier = 2
    } = options;

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            // Check if error is retryable (429, 5xx, network errors)
            const isRetryable = 
                error.response?.status === 429 ||
                (error.response?.status >= 500) ||
                error.code === 'ECONNREFUSED' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT';
            
            if (!isRetryable || attempt === maxAttempts) {
                throw error;
            }

            const delay = Math.min(
                baseDelay * Math.pow(backoffMultiplier, attempt - 1),
                maxDelay
            );
            
            console.log(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);
            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Validate CSV rows have required columns
 */
export function validateCsvColumns(rows, requiredColumns) {
    if (rows.length === 0) {
        throw new Error("CSV is empty");
    }

    const firstRow = rows[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
    }

    return true;
}

/**
 * Parse command line arguments
 */
export function parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
        resume: false,
        dryRun: false,
        limit: null,
        movieOnly: false,
        episodesOnly: false,
        verbose: false,
        cacheClear: false
    };

    for (const arg of args) {
        if (arg === '--resume') parsed.resume = true;
        else if (arg === '--dry-run') parsed.dryRun = true;
        else if (arg === '--movie-only') parsed.movieOnly = true;
        else if (arg === '--episodes-only') parsed.episodesOnly = true;
        else if (arg === '--verbose') parsed.verbose = true;
        else if (arg === '--cache-clear') parsed.cacheClear = true;
        else if (arg.startsWith('--limit=')) {
            parsed.limit = parseInt(arg.split('=')[1], 10);
        }
    }

    return parsed;
}

/**
 * Format time duration
 */
export function formatDuration(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Calculate ETA based on items processed and time elapsed
 */
export function calculateEta(itemsProcessed, totalItems, startTime) {
    if (itemsProcessed === 0) return 'calculating...';
    
    const elapsed = Date.now() - startTime;
    const avgTime = elapsed / itemsProcessed;
    const remaining = totalItems - itemsProcessed;
    const etaMs = avgTime * remaining;

    return formatDuration(etaMs);
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate Levenshtein distance (for fuzzy matching)
 */
export function levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i][j - 1] + 1,
                matrix[i - 1][j] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Normalize title for comparison (lowercase, remove special chars)
 */
export function normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculate fuzzy match score (0-1, higher is better)
 */
export function fuzzyMatchScore(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    if (norm1 === norm2) return 1.0;

    const distance = levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    const similarity = 1 - (distance / maxLength);

    return similarity;
}

/**
 * Display progress bar
 */
export function displayProgress(loaded, imported, skipped, failed, eta) {
    console.clear();
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║         TV Time → Trakt Importer          ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║ Loaded:   ${String(loaded).padEnd(35)} ║`);
    console.log(`║ Imported: ${String(imported).padEnd(35)} ║`);
    console.log(`║ Skipped:  ${String(skipped).padEnd(35)} ║`);
    console.log(`║ Failed:   ${String(failed).padEnd(35)} ║`);
    console.log(`║ ETA:      ${String(eta).padEnd(35)} ║`);
    console.log('╚════════════════════════════════════════════╝\n');
}
