/**
 * Authentication module for OAuth flow
 * Handles Trakt OAuth authorization
 */

import express from 'express';
import axios from 'axios';
import open from 'open';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

const {
    TRAKT_CLIENT_ID,
    TRAKT_CLIENT_SECRET
} = process.env;

/**
 * Start OAuth flow
 */
export async function startOAuthFlow() {
    return new Promise((resolve, reject) => {
        app.get('/callback', async (req, res) => {
            const code = req.query.code;

            try {
                const { data } = await axios.post(
                    'https://api.trakt.tv/oauth/token',
                    {
                        code,
                        client_id: TRAKT_CLIENT_ID,
                        client_secret: TRAKT_CLIENT_SECRET,
                        redirect_uri: 'http://localhost:3000/callback',
                        grant_type: 'authorization_code'
                    }
                );

                console.log('\n════════════════════════════════════════════');
                console.log('✓ Authentication successful!');
                console.log('════════════════════════════════════════════');
                console.log('\nAdd this to your .env file:');
                console.log(`TRAKT_ACCESS_TOKEN=${data.access_token}`);
                console.log('════════════════════════════════════════════\n');

                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Trakt Authentication</title>
                        <style>
                            body { font-family: Arial; text-align: center; padding: 50px; }
                            .success { color: green; font-size: 20px; }
                            .token { background: #f0f0f0; padding: 10px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="success">✓ Authentication successful!</div>
                        <p>You can close this window.</p>
                        <div class="token">
                            <p>Access token saved. You can now import your watch history.</p>
                        </div>
                    </body>
                    </html>
                `);

                server.close();
                resolve(data.access_token);

            } catch (err) {
                console.error('Authentication failed:', err.response?.data || err.message);
                res.send('Authentication failed. Check console for details.');
                server.close();
                reject(err);
            }
        });

        const server = app.listen(PORT, () => {
            const url =
                `https://trakt.tv/oauth/authorize?response_type=code` +
                `&client_id=${TRAKT_CLIENT_ID}` +
                `&redirect_uri=http://localhost:3000/callback`;

            console.log('Opening browser for authentication...');
            open(url);
        });
    });
}

/**
 * Validate that required tokens are set
 */
export function validateTokens() {
    if (!process.env.TRAKT_CLIENT_ID) {
        throw new Error('TRAKT_CLIENT_ID not set in .env');
    }
    if (!process.env.TRAKT_CLIENT_SECRET) {
        throw new Error('TRAKT_CLIENT_SECRET not set in .env');
    }
    if (!process.env.TRAKT_ACCESS_TOKEN) {
        throw new Error('TRAKT_ACCESS_TOKEN not set in .env. Run: node src/auth.js');
    }
}
