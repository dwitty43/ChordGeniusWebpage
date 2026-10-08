const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let sqliteDb = null;
let activeDriver = 'postgres'; // 'postgres' | 'sqlite'

// Initialize directory for local data fallback if needed
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const sqlitePath = path.join(dataDir, 'chordgenius.db');

/**
 * Initializes the database connection and runs migration scripts.
 */
async function initDb() {
    // Attempt connecting to PostgreSQL if DATABASE_URL or standard PG credentials exist
    try {
        const poolConfig = {
            connectionString: DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/chordgenius',
            connectionTimeoutMillis: 3000
        };

        if (DATABASE_URL && !DATABASE_URL.includes('localhost') && !DATABASE_URL.includes('127.0.0.1')) {
            poolConfig.ssl = { rejectUnauthorized: false };
        }

        const testPool = new Pool(poolConfig);
        // Test connection with a quick query
        const client = await testPool.connect();
        client.release();

        pool = testPool;
        activeDriver = 'postgres';
        console.log(`[Database] Connected to PostgreSQL successfully via ${DATABASE_URL ? 'DATABASE_URL' : 'localhost'}.`);

        await createPostgresTables();
        return;
    } catch (pgErr) {
        console.warn(`[Database] PostgreSQL connection failed (${pgErr.message}).`);
        console.warn(`[Database] Falling back to persistent local SQLite storage at ${sqlitePath}. (To use PostgreSQL, set DATABASE_URL in your environment).`);

        activeDriver = 'sqlite';
        await initSqlite();
    }
}

async function createPostgresTables() {
    const ddl = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saved_songs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            artist VARCHAR(255) DEFAULT '',
            query VARCHAR(255) DEFAULT '',
            source_url TEXT DEFAULT '',
            original_key VARCHAR(50) DEFAULT '',
            target_key VARCHAR(50) DEFAULT '',
            capo INTEGER DEFAULT 0,
            bpm INTEGER,
            time_signature VARCHAR(20) DEFAULT '',
            chart_text TEXT NOT NULL,
            original_text TEXT DEFAULT '',
            voicing_mode VARCHAR(50) DEFAULT 'guitar',
            notes TEXT DEFAULT '',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saved_setlists (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL DEFAULT 'Setlist Binder',
            songs_json TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS search_history (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            query VARCHAR(255) NOT NULL,
            key VARCHAR(50) DEFAULT '',
            capo INTEGER DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_saved_songs_user ON saved_songs(user_id);
        CREATE INDEX IF NOT EXISTS idx_saved_setlists_user ON saved_setlists(user_id);
        CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history(user_id);
    `;

    await pool.query(ddl);
    console.log('[Database] PostgreSQL schemas & indices initialized.');
}

function initSqlite() {
    return new Promise((resolve, reject) => {
        const sqlite3 = require('sqlite3').verbose();
        sqliteDb = new sqlite3.Database(sqlitePath, (err) => {
            if (err) return reject(err);
            
            sqliteDb.serialize(() => {
                sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);

                sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS saved_songs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        title TEXT NOT NULL,
                        artist TEXT DEFAULT '',
                        query TEXT DEFAULT '',
                        source_url TEXT DEFAULT '',
                        original_key TEXT DEFAULT '',
                        target_key TEXT DEFAULT '',
                        capo INTEGER DEFAULT 0,
                        bpm INTEGER,
                        time_signature TEXT DEFAULT '',
                        chart_text TEXT NOT NULL,
                        original_text TEXT DEFAULT '',
                        voicing_mode TEXT DEFAULT 'guitar',
                        notes TEXT DEFAULT '',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                    )
                `);

                sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS saved_setlists (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        title TEXT NOT NULL DEFAULT 'Setlist Binder',
                        songs_json TEXT NOT NULL DEFAULT '[]',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                    )
                `);

                sqliteDb.run(`
                    CREATE TABLE IF NOT EXISTS search_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        query TEXT NOT NULL,
                        key TEXT DEFAULT '',
                        capo INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
                    )
                `);

                console.log('[Database] SQLite fallback tables initialized.');
                resolve();
            });
        });
    });
}

// ---------------------------------------------------------------------------
// DATA ACCESS METHODS
// ---------------------------------------------------------------------------

// --- USERS ---

async function createUser({ name, email, passwordHash }) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
            [name, email.toLowerCase().trim(), passwordHash]
        );
        return res.rows[0];
    } else {
        return new Promise((resolve, reject) => {
            const cleanEmail = email.toLowerCase().trim();
            sqliteDb.run(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                [name, cleanEmail, passwordHash],
                function (err) {
                    if (err) return reject(err);
                    sqliteDb.get(
                        'SELECT id, name, email, created_at FROM users WHERE id = ?',
                        [this.lastID],
                        (err2, row) => {
                            if (err2) return reject(err2);
                            resolve(row);
                        }
                    );
                }
            );
        });
    }
}

async function findUserByEmail(email) {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (activeDriver === 'postgres') {
        const res = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
        return res.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.get('SELECT * FROM users WHERE email = ?', [cleanEmail], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }
}

async function findUserById(id) {
    if (activeDriver === 'postgres') {
        const res = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [id]);
        return res.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.get('SELECT id, name, email, created_at FROM users WHERE id = ?', [id], (err, row) => {
                if (err) return reject(err);
                resolve(row || null);
            });
        });
    }
}

// --- SAVED SONGS & SCRAPES ---

async function createSavedSong({
    userId,
    title,
    artist = '',
    query = '',
    sourceUrl = '',
    originalKey = '',
    targetKey = '',
    capo = 0,
    bpm = null,
    timeSignature = '',
    chartText,
    originalText = '',
    voicingMode = 'guitar',
    notes = ''
}) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            `INSERT INTO saved_songs (
                user_id, title, artist, query, source_url, original_key,
                target_key, capo, bpm, time_signature, chart_text,
                original_text, voicing_mode, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                userId, title, artist, query, sourceUrl, originalKey,
                targetKey, capo, bpm, timeSignature, chartText,
                originalText, voicingMode, notes
            ]
        );
        return res.rows[0];
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                `INSERT INTO saved_songs (
                    user_id, title, artist, query, source_url, original_key,
                    target_key, capo, bpm, time_signature, chart_text,
                    original_text, voicing_mode, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, title, artist, query, sourceUrl, originalKey,
                    targetKey, capo, bpm, timeSignature, chartText,
                    originalText, voicingMode, notes
                ],
                function (err) {
                    if (err) return reject(err);
                    sqliteDb.get('SELECT * FROM saved_songs WHERE id = ?', [this.lastID], (err2, row) => {
                        if (err2) return reject(err2);
                        resolve(row);
                    });
                }
            );
        });
    }
}

async function getSavedSongsByUserId(userId) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'SELECT * FROM saved_songs WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return res.rows;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.all(
                'SELECT * FROM saved_songs WHERE user_id = ? ORDER BY created_at DESC',
                [userId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }
}

async function getSavedSongById(id, userId) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'SELECT * FROM saved_songs WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        return res.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.get(
                'SELECT * FROM saved_songs WHERE id = ? AND user_id = ?',
                [id, userId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row || null);
                }
            );
        });
    }
}

async function deleteSavedSong(id, userId) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'DELETE FROM saved_songs WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return res.rowCount > 0;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                'DELETE FROM saved_songs WHERE id = ? AND user_id = ?',
                [id, userId],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.changes > 0);
                }
            );
        });
    }
}

async function updateSavedSong(id, userId, updates) {
    const { title, notes, chartText, targetKey, capo } = updates;
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            `UPDATE saved_songs 
             SET title = COALESCE($1, title),
                 notes = COALESCE($2, notes),
                 chart_text = COALESCE($3, chart_text),
                 target_key = COALESCE($4, target_key),
                 capo = COALESCE($5, capo),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 AND user_id = $7
             RETURNING *`,
            [title, notes, chartText, targetKey, capo, id, userId]
        );
        return res.rows[0] || null;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                `UPDATE saved_songs
                 SET title = COALESCE(?, title),
                     notes = COALESCE(?, notes),
                     chart_text = COALESCE(?, chart_text),
                     target_key = COALESCE(?, target_key),
                     capo = COALESCE(?, capo),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND user_id = ?`,
                [title, notes, chartText, targetKey, capo, id, userId],
                function (err) {
                    if (err) return reject(err);
                    if (this.changes === 0) return resolve(null);
                    sqliteDb.get('SELECT * FROM saved_songs WHERE id = ?', [id], (err2, row) => {
                        if (err2) return reject(err2);
                        resolve(row);
                    });
                }
            );
        });
    }
}

// --- SEARCH HISTORY ---

async function saveSearchHistory({ userId, query, key = '', capo = 0 }) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'INSERT INTO search_history (user_id, query, key, capo) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, query, key, capo]
        );
        return res.rows[0];
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                'INSERT INTO search_history (user_id, query, key, capo) VALUES (?, ?, ?, ?)',
                [userId, query, key, capo],
                function (err) {
                    if (err) return reject(err);
                    resolve({ id: this.lastID, user_id: userId, query, key, capo });
                }
            );
        });
    }
}

async function getSearchHistoryByUserId(userId, limit = 20) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'SELECT * FROM search_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
            [userId, limit]
        );
        return res.rows;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.all(
                'SELECT * FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows || []);
                }
            );
        });
    }
}

async function clearSearchHistory(userId) {
    if (activeDriver === 'postgres') {
        await pool.query('DELETE FROM search_history WHERE user_id = $1', [userId]);
        return true;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run('DELETE FROM search_history WHERE user_id = ?', [userId], (err) => {
                if (err) return reject(err);
                resolve(true);
            });
        });
    }
}

// --- SAVED SETLISTS ---

async function createSavedSetlist({ userId, title = 'Setlist Binder', songs = [] }) {
    const songsJson = typeof songs === 'string' ? songs : JSON.stringify(songs);
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'INSERT INTO saved_setlists (user_id, title, songs_json) VALUES ($1, $2, $3) RETURNING *',
            [userId, title, songsJson]
        );
        const row = res.rows[0];
        return { ...row, songs: JSON.parse(row.songs_json || '[]') };
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                'INSERT INTO saved_setlists (user_id, title, songs_json) VALUES (?, ?, ?)',
                [userId, title, songsJson],
                function (err) {
                    if (err) return reject(err);
                    sqliteDb.get('SELECT * FROM saved_setlists WHERE id = ?', [this.lastID], (err2, row) => {
                        if (err2) return reject(err2);
                        resolve({ ...row, songs: JSON.parse(row.songs_json || '[]') });
                    });
                }
            );
        });
    }
}

async function getSavedSetlistsByUserId(userId) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'SELECT * FROM saved_setlists WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return res.rows.map(r => ({ ...r, songs: JSON.parse(r.songs_json || '[]') }));
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.all(
                'SELECT * FROM saved_setlists WHERE user_id = ? ORDER BY created_at DESC',
                [userId],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve((rows || []).map(r => ({ ...r, songs: JSON.parse(r.songs_json || '[]') })));
                }
            );
        });
    }
}

async function deleteSavedSetlist(id, userId) {
    if (activeDriver === 'postgres') {
        const res = await pool.query(
            'DELETE FROM saved_setlists WHERE id = $1 AND user_id = $2 RETURNING id',
            [id, userId]
        );
        return res.rowCount > 0;
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.run(
                'DELETE FROM saved_setlists WHERE id = ? AND user_id = ?',
                [id, userId],
                function (err) {
                    if (err) return reject(err);
                    resolve(this.changes > 0);
                }
            );
        });
    }
}

// --- USER PROFILE STATS ---

async function getUserStats(userId) {
    if (activeDriver === 'postgres') {
        const songsCount = await pool.query('SELECT COUNT(*) FROM saved_songs WHERE user_id = $1', [userId]);
        const setlistsCount = await pool.query('SELECT COUNT(*) FROM saved_setlists WHERE user_id = $1', [userId]);
        const searchesCount = await pool.query('SELECT COUNT(*) FROM search_history WHERE user_id = $1', [userId]);
        return {
            savedSongsCount: parseInt(songsCount.rows[0].count, 10),
            savedSetlistsCount: parseInt(setlistsCount.rows[0].count, 10),
            searchHistoryCount: parseInt(searchesCount.rows[0].count, 10),
            activeDriver
        };
    } else {
        return new Promise((resolve, reject) => {
            sqliteDb.get(
                `SELECT 
                    (SELECT COUNT(*) FROM saved_songs WHERE user_id = ?) as songsCount,
                    (SELECT COUNT(*) FROM saved_setlists WHERE user_id = ?) as setlistsCount,
                    (SELECT COUNT(*) FROM search_history WHERE user_id = ?) as searchesCount`,
                [userId, userId, userId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve({
                        savedSongsCount: row?.songsCount || 0,
                        savedSetlistsCount: row?.setlistsCount || 0,
                        searchHistoryCount: row?.searchesCount || 0,
                        activeDriver
                    });
                }
            );
        });
    }
}

module.exports = {
    initDb,
    createUser,
    findUserByEmail,
    findUserById,
    createSavedSong,
    getSavedSongsByUserId,
    getSavedSongById,
    deleteSavedSong,
    updateSavedSong,
    saveSearchHistory,
    getSearchHistoryByUserId,
    clearSearchHistory,
    createSavedSetlist,
    getSavedSetlistsByUserId,
    deleteSavedSetlist,
    getUserStats,
    getActiveDriver: () => activeDriver
};
