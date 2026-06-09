# Chord Genius User Account Backend: Database Schema & Setup Guide

This comprehensive blueprint details the backend architecture, relational database schema, and step-by-step setup instructions for **Chord Genius’s** user account backend. 

By following this guide, you will establish a production-grade backend that securely manages user authentication, user-specific transposition defaults, custom song persistence, ordered setlists, and tiered credit/rate limits.

---

## 1. Architectural Overview & Cohesive Tech Stack

To deliver a scalable, secure, and developer-friendly experience, we recommend a modern, decoupled cloud architecture:

```mermaid
graph TD
    Client["Frontend (React / Next.js)"] -->|1. Sign Up / Sign In| SupabaseAuth["Supabase Auth (Identity Provider)"]
    SupabaseAuth -->|2. Issue JWT (signed with HS256)| Client
    Client -->|3. Requests with Bearer JWT| Express["Express Server (Railway Node.js API)"]
    Express -->|4. Decode & Verify JWT Locally| Express
    Express -->|5. Parameterized SQL Queries (user_id)| SupabaseDB[("Supabase PostgreSQL Database")]
```

### The Tech Stack Components

1. **Authentication: Supabase Auth**
   * **Role**: Handles email/password sign-up, password reset, email verification, session management, and social OAuth providers (Google, Apple, GitHub, etc.).
   * **Why**: It is fully managed, OIDC-compliant, and issues cryptographic JSON Web Tokens (JWTs) containing user profiles.
2. **Database: Supabase PostgreSQL**
   * **Role**: Serves as our primary relational database.
   * **Why**: Native support for UUIDs, high-performance B-Tree indexes, JSONB for flexible edits, strong referential constraints, and automatic scaling.
3. **App Server: Node/Express on Railway**
   * **Role**: Hosts the core API engine, running the Nashville Number/transposition code, PDF/DOCX renderers, Spotify audio feature queries, custom route handlers, Stripe webhooks, and rate-limiting middleware.
   * **Why**: Railway provides containerized deployments with automatic Git-integrated builds, private secure networking, and seamless environment variable injection.

### The Request/Authentication Lifecycle
1. The **Client App** authenticates directly with **Supabase Auth**.
2. Supabase returns a cryptographically signed **JWT access token** to the client.
3. For protected actions (e.g., retrieving settings, saving custom songs), the Client App attaches the token to the header: `Authorization: Bearer <JWT>`.
4. The **Express Server on Railway** interceptor validates the JWT using the shared **Supabase JWT Secret** (using standard HS256 local validation). **No remote network calls to Supabase are made for authentication**, resulting in sub-millisecond validation times.
5. Express extracts the verified user UUID (`sub` claim) and executes parameterized PostgreSQL queries to fetch or modify user-owned rows.

---

## 2. Relational Database Schema (PostgreSQL DDL)

Here is the complete entity relationship (ER) layout showing how settings, saved songs, setlists, and rate-limit credit balances map to authenticated profiles.

```mermaid
erDiagram
    profiles ||--|| user_settings : "has custom settings"
    profiles ||--o{ saved_songs : "creates custom sheets"
    profiles ||--o{ binders : "organizes binders"
    profiles ||--o{ setlists : "assembles setlists"
    profiles ||--|| user_api_limits : "has credit limits"
    binders ||--o{ setlists : "groups"
    setlists ||--o{ setlist_songs : "lists songs with sort_order"
    saved_songs ||--o{ setlist_songs : "appears in"
```

### Complete DDL Migration Script

Execute this SQL script directly in the **Supabase SQL Editor** or via a migration framework (such as `db-migrate` or the Supabase CLI).

```sql
-- =========================================================================
-- CHORD GENIUS DATABASE SCHEMA MIGRATION
-- Target: PostgreSQL 14+ / Supabase PostgreSQL
-- =========================================================================

-- Enable necessary extension for cryptographic and UUID helper functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. Profiles Table (Extends auth.users from Supabase Auth)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    billing_tier VARCHAR(20) DEFAULT 'free' NOT NULL,
    stripe_customer_id VARCHAR(100) UNIQUE,
    stripe_subscription_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_billing_tier CHECK (billing_tier IN ('free', 'pro'))
);

-- Reusable database function to automatically keep updated_at columns current
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 2. User Settings Table (Stores UI preference details and chord defaults)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    ui_theme VARCHAR(20) DEFAULT 'system' NOT NULL,
    default_simplified_chords BOOLEAN DEFAULT FALSE NOT NULL,
    default_chord_format VARCHAR(20) DEFAULT 'standard' NOT NULL,
    auto_scroll_speed INTEGER DEFAULT 10 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_ui_theme CHECK (ui_theme IN ('light', 'dark', 'system')),
    CONSTRAINT chk_chord_format CHECK (default_chord_format IN ('standard', 'roman', 'nashville', 'solfege')),
    CONSTRAINT chk_auto_scroll_speed CHECK (auto_scroll_speed BETWEEN 1 AND 100)
);

CREATE TRIGGER tr_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 3. Saved Songs Table (Stores personalized song metadata, keys, and sheets)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    song_id VARCHAR(100), -- Nullable: empty for completely custom songs, has ID for catalog links
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) DEFAULT 'Unknown Artist',
    original_key VARCHAR(10) NOT NULL,
    transposed_key VARCHAR(10) NOT NULL,
    capo_fret INTEGER DEFAULT 0 NOT NULL,
    bpm INTEGER,
    time_signature VARCHAR(10) DEFAULT '4/4' NOT NULL,
    raw_text TEXT NOT NULL, -- The monospaced raw text tab chart sheet
    custom_lyric_modifications JSONB DEFAULT '{}'::jsonb NOT NULL, -- Map of {lineIndex: "custom text changes"}
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_capo_fret CHECK (capo_fret BETWEEN 0 AND 24),
    CONSTRAINT chk_bpm CHECK (bpm IS NULL OR (bpm > 0 AND bpm < 300))
);

-- Partial Unique Index: A user can save multiple custom songs (where song_id is null)
-- but cannot save duplicate entries of the same Catalog Song.
CREATE UNIQUE INDEX idx_unique_user_catalog_song 
ON public.saved_songs(user_id, song_id) 
WHERE song_id IS NOT NULL;

CREATE TRIGGER tr_saved_songs_updated_at
    BEFORE UPDATE ON public.saved_songs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 4. Binders Table (Organizes lists of setlists)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.binders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER tr_binders_updated_at
    BEFORE UPDATE ON public.binders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 5. Setlists Table (Logical playlist of saved transpositions)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    binder_id UUID REFERENCES public.binders(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TRIGGER tr_setlists_updated_at
    BEFORE UPDATE ON public.setlists
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 6. Setlist Songs Junction Table (With Strict Ordering)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setlist_songs (
    setlist_id UUID NOT NULL REFERENCES public.setlists(id) ON DELETE CASCADE,
    saved_song_id UUID NOT NULL REFERENCES public.saved_songs(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    PRIMARY KEY (setlist_id, saved_song_id),
    CONSTRAINT chk_sort_order CHECK (sort_order >= 0)
);

-- Deferred uniqueness prevents transactional errors when swapping indexes.
-- Uniqueness is validated only at the moment of Transaction COMMIT.
ALTER TABLE public.setlist_songs
ADD CONSTRAINT setlist_songs_sort_order_unique
UNIQUE (setlist_id, sort_order)
DEFERRABLE INITIALLY DEFERRED;

-- -------------------------------------------------------------------------
-- 7. Credit & API Rate Limits Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_api_limits (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    api_calls_count INTEGER DEFAULT 0 NOT NULL,
    api_calls_limit INTEGER DEFAULT 100 NOT NULL,  -- Daily limit on raw requests (e.g. 100 Free, 5000 Pro)
    credits_remaining INTEGER DEFAULT 20 NOT NULL, -- Daily premium action credits (e.g. PDF renders, AI tab search)
    last_reset_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT chk_api_calls_count CHECK (api_calls_count >= 0),
    CONSTRAINT chk_api_calls_limit CHECK (api_calls_limit > 0),
    CONSTRAINT chk_credits_remaining CHECK (credits_remaining >= 0)
);

CREATE TRIGGER tr_user_api_limits_updated_at
    BEFORE UPDATE ON public.user_api_limits
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 8. Performance Indexes (B-Tree Optimized Search Paths)
-- -------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_saved_songs_user ON public.saved_songs(user_id);
CREATE INDEX IF NOT EXISTS idx_binders_user ON public.binders(user_id);
CREATE INDEX IF NOT EXISTS idx_setlists_user ON public.setlists(user_id);
CREATE INDEX IF NOT EXISTS idx_setlists_binder ON public.setlists(binder_id);
CREATE INDEX IF NOT EXISTS idx_setlist_songs_song ON public.setlist_songs(saved_song_id);
CREATE INDEX IF NOT EXISTS idx_setlist_songs_order ON public.setlist_songs(setlist_id, sort_order);

-- -------------------------------------------------------------------------
-- 9. Automatic Profile & Settings Creation Sync (Auth Triggers)
-- -------------------------------------------------------------------------
-- Automatically populates profiles, settings, and rate-limits upon email signup.
CREATE OR REPLACE FUNCTION public.handle_new_supabase_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url, billing_tier)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', 'New Guitarist'),
        COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
        'free'
    );
    
    INSERT INTO public.user_settings (user_id)
    VALUES (new.id);
    
    INSERT INTO public.user_api_limits (user_id, api_calls_limit, credits_remaining)
    VALUES (new.id, 100, 20);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger attached directly to auth.users in Supabase Auth
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_supabase_user();
```

> [!TIP]
> **Why `DEFERRABLE INITIALLY DEFERRED` on Sort Orders?**
> When a user drags a song in a setlist to reorder it (e.g. swapping index 2 and index 3), a standard database constraint will immediately crash the query because two songs will temporarily share index 2. Deferring the uniqueness constraint allows the engine to wait until all rows are updated before checking uniqueness right at `COMMIT`.

---

## 3. Step-by-Step Backend Integration Instructions

### Step 1: Set Up Supabase

1. **Create Project**: Go to [Supabase Console](https://supabase.com/) and create a new project.
2. **Retrieve API Settings**:
   * Navigate to **Project Settings** > **API**.
   * Retrieve your database **Connection String** (`postgresql://...`).
   * Retrieve the **JWT Secret** (used in Express to verify frontend JWT signatures).
3. **Configure Authentication**:
   * Navigate to **Authentication** > **Providers**.
   * Ensure **Email** is activated. Set up any OAuth credentials (Google, GitHub) you want.
   * Adjust **Redirect URLs** to match Railway/localhost environments.

---

### Step 2: Database Migration Execution

1. Navigate to the **SQL Editor** on your Supabase dashboard.
2. Click **New Query**, paste the complete DDL script from Section 2, and click **Run**.
3. Confirm that tables `profiles`, `user_settings`, `saved_songs`, `binders`, `setlists`, `setlist_songs`, and `user_api_limits` populate the `public` schema.

---

### Step 3: Deploying Express on Railway

1. **Connect Repository**: Create a new project in the [Railway Dashboard](https://railway.app/) and link it to your GitHub Repository containing your Express engine.
2. **Inject Environment Variables**:
   Go to your Service **Variables** tab on Railway and inject the following required variables:
   
   | Variable Name | Example Value | Description |
   |---|---|---|
   | `PORT` | `3000` | Port Express runs on |
   | `NODE_ENV` | `production` | Deployment mode |
   | `SUPABASE_JWT_SECRET` | `your-long-supabase-jwt-secret` | The Secret retrieved in **Step 1** |
   | `DATABASE_URL` | `postgresql://postgres:pwd@db.supabase.co:5432/postgres` | PostgreSQL connection pool URI |
   | `CLIENT_URL` | `https://chordgenius.com` | CORS Allowed Origins |

4. **Deploy**: Railway builds automatically based on package dependency cues. Ensure your startup script in `package.json` calls `node server.js`.

---

### Step 4: Express JWT Validation Middleware

Install the required JSON Web Token verifier package:
```bash
npm install jsonwebtoken pg
```

Create a verification file `middleware/auth.js` in your backend directory:

```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Express Middleware verifying JWTs issued by Supabase Auth.
 * Secures routes and attaches parsed user metadata to req.user.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: 'Authorization header is missing or malformed. Format must be: "Bearer <JWT>"' 
        });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        // Supabase JWTs are signed with the project's JWT Secret using standard HS256
        const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
        
        // The unique user ID in Supabase Auth is stored in the 'sub' claim
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role
        };
        
        next();
    } catch (error) {
        console.error('[Auth Error] JWT verification failed:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Your login session has expired. Please log in again.' });
        }
        
        return res.status(401).json({ error: 'Invalid or tampered access token' });
    }
}

module.exports = { requireAuth };
```

---

### Step 5: Implementing Endpoints in Express

Integrate this database driver connection pool and endpoints block inside your main `server.js` or separate routers to handle profile settings, transpositions, and setlists securely.

```javascript
// =========================================================================
// CHORD GENIUS DATABASE PERSISTENCE ROUTES
// =========================================================================
const { Pool } = require('pg');
const { requireAuth } = require('./middleware/auth'); // Import the JWT validator

// Setup PostgreSQL pool with production-grade configurations
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,              // Limit of active database client connections in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('❌ Database connection pool error:', err.stack);
    else console.log('✅ PostgreSQL database connection pool initialized successfully.');
});

// -------------------------------------------------------------------------
// ROUTE A: PERSIST & LOAD USER SETTINGS
// -------------------------------------------------------------------------

// GET User Theme & Chord Settings
app.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ui_theme, default_simplified_chords, default_chord_format, auto_scroll_speed 
             FROM public.user_settings 
             WHERE user_id = $1`,
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Settings profile not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[API Error] Fetching settings failed:', err.message);
        res.status(500).json({ error: 'Failed to retrieve settings.' });
    }
});

// PUT / UPDATE User Settings
app.put('/api/settings', requireAuth, async (req, res) => {
    const { ui_theme, default_simplified_chords, default_chord_format, auto_scroll_speed } = req.body;
    
    // Strict schema sanitization
    if (ui_theme && !['light', 'dark', 'system'].includes(ui_theme)) {
        return res.status(400).json({ error: 'Invalid ui_theme value.' });
    }
    if (default_chord_format && !['standard', 'roman', 'nashville', 'solfege'].includes(default_chord_format)) {
        return res.status(400).json({ error: 'Invalid default_chord_format.' });
    }
    if (auto_scroll_speed && (auto_scroll_speed < 1 || auto_scroll_speed > 100)) {
        return res.status(400).json({ error: 'Auto-scroll speed must be between 1 and 100.' });
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO public.user_settings (user_id, ui_theme, default_simplified_chords, default_chord_format, auto_scroll_speed)
             VALUES ($1, COALESCE($2, 'system'), COALESCE($3, FALSE), COALESCE($4, 'standard'), COALESCE($5, 10))
             ON CONFLICT (user_id) DO UPDATE 
             SET ui_theme = COALESCE($2, public.user_settings.ui_theme),
                 default_simplified_chords = COALESCE($3, public.user_settings.default_simplified_chords),
                 default_chord_format = COALESCE($4, public.user_settings.default_chord_format),
                 auto_scroll_speed = COALESCE($5, public.user_settings.auto_scroll_speed),
                 updated_at = NOW()
             RETURNING ui_theme, default_simplified_chords, default_chord_format, auto_scroll_speed`,
            [req.user.id, ui_theme, default_simplified_chords, default_chord_format, auto_scroll_speed]
        );
        
        res.json({ message: 'Settings saved successfully', settings: result.rows[0] });
    } catch (err) {
        console.error('[API Error] Saving settings failed:', err.message);
        res.status(500).json({ error: 'Failed to update preferences.' });
    }
});

// -------------------------------------------------------------------------
// ROUTE B: PERSIST & RETRIEVE SAVED TRANSPOSED SONGS
// -------------------------------------------------------------------------

// GET List of all saved transpositions
app.get('/api/songs', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, song_id, title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications, updated_at
             FROM public.saved_songs 
             WHERE user_id = $1 
             ORDER BY updated_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[API Error] Fetching saved songs failed:', err.message);
        res.status(500).json({ error: 'Failed to retrieve saved songs.' });
    }
});

// POST Save new custom transposed sheet
app.post('/api/songs', requireAuth, async (req, res) => {
    const { 
        song_id, title, artist, original_key, transposed_key, 
        capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications 
    } = req.body;
    
    if (!title || !original_key || !transposed_key || !raw_text) {
        return res.status(400).json({ error: 'Missing mandatory fields (title, original_key, transposed_key, raw_text).' });
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO public.saved_songs 
             (user_id, song_id, title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), $8, COALESCE($9, '4/4'), $10, COALESCE($11, '{}'::jsonb))
             RETURNING id, song_id, title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications, created_at`,
            [
                req.user.id, 
                song_id || null, 
                title, 
                artist || 'Unknown Artist', 
                original_key, 
                transposed_key, 
                capo_fret || 0, 
                bpm || null, 
                time_signature || '4/4', 
                raw_text, 
                JSON.stringify(custom_lyric_modifications || {})
            ]
        );
        
        res.status(201).json({ message: 'Song saved to library.', song: result.rows[0] });
    } catch (err) {
        console.error('[API Error] Saving song failed:', err.message);
        if (err.code === '23505') { // Unique constraint violation (user_id, song_id)
            return res.status(409).json({ error: 'This catalog song is already in your library. Update it instead.' });
        }
        res.status(500).json({ error: 'Failed to persist song transposition.' });
    }
});

// PUT / UPDATE Saved Song Transposition & Modifications
app.put('/api/songs/:id', requireAuth, async (req, res) => {
    const songId = req.params.id;
    const { title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE public.saved_songs
             SET title = COALESCE($2, title),
                 artist = COALESCE($3, artist),
                 original_key = COALESCE($4, original_key),
                 transposed_key = COALESCE($5, transposed_key),
                 capo_fret = COALESCE($6, capo_fret),
                 bpm = COALESCE($7, bpm),
                 time_signature = COALESCE($8, time_signature),
                 raw_text = COALESCE($9, raw_text),
                 custom_lyric_modifications = COALESCE($10, custom_lyric_modifications),
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $11
             RETURNING id, title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text, custom_lyric_modifications, updated_at`,
            [
                songId, title, artist, original_key, transposed_key, capo_fret, bpm, time_signature, raw_text,
                custom_lyric_modifications ? JSON.stringify(custom_lyric_modifications) : null,
                req.user.id
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Song not found or unauthorized edit attempt.' });
        }
        res.json({ message: 'Song updated successfully', song: result.rows[0] });
    } catch (err) {
        console.error('[API Error] Modifying song failed:', err.message);
        res.status(500).json({ error: 'Failed to update song details.' });
    }
});

// DELETE Saved Song
app.delete('/api/songs/:id', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM public.saved_songs WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Song not found or unauthorized deletion request.' });
        }
        res.json({ message: 'Song permanently deleted from library.', id: req.params.id });
    } catch (err) {
        console.error('[API Error] Deleting song failed:', err.message);
        res.status(500).json({ error: 'Failed to delete song.' });
    }
});

// -------------------------------------------------------------------------
// ROUTE C: ORDERED SETLISTS MANAGEMENT
// -------------------------------------------------------------------------

// GET List of Setlists
app.get('/api/setlists', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.id, s.name, s.description, s.binder_id, s.created_at, s.updated_at,
                    COUNT(ss.saved_song_id)::integer as song_count
             FROM public.setlists s
             LEFT JOIN public.setlist_songs ss ON s.id = ss.setlist_id
             WHERE s.user_id = $1
             GROUP BY s.id
             ORDER BY s.updated_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[API Error] Fetching setlists failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch setlists.' });
    }
});

// POST Create new empty setlist
app.post('/api/setlists', requireAuth, async (req, res) => {
    const { name, description, binder_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Setlist name is required.' });
    
    try {
        const result = await pool.query(
            'INSERT INTO public.setlists (user_id, name, description, binder_id) VALUES ($1, $2, $3, $4) RETURNING id, name, description, binder_id, created_at',
            [req.user.id, name, description || '', binder_id || null]
        );
        res.status(201).json({ message: 'Setlist created.', setlist: result.rows[0] });
    } catch (err) {
        console.error('[API Error] Creating setlist failed:', err.message);
        res.status(500).json({ error: 'Failed to create setlist.' });
    }
});

// GET Fetch all songs inside a setlist (Properly Ordered)
app.get('/api/setlists/:id/songs', requireAuth, async (req, res) => {
    const setlistId = req.params.id;
    
    try {
        // Validate setlist ownership
        const setlistCheck = await pool.query('SELECT id FROM public.setlists WHERE id = $1 AND user_id = $2', [setlistId, req.user.id]);
        if (setlistCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Setlist not found.' });
        }
        
        const result = await pool.query(
            `SELECT ss.sort_order, s.id, s.song_id, s.title, s.artist, s.transposed_key, s.capo_fret, s.bpm, s.time_signature
             FROM public.setlist_songs ss
             JOIN public.saved_songs s ON ss.saved_song_id = s.id
             WHERE ss.setlist_id = $1
             ORDER BY ss.sort_order ASC`,
            [setlistId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[API Error] Fetching setlist songs failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch setlist items.' });
    }
});

// POST Add Song to Setlist (Appends to the bottom)
app.post('/api/setlists/:id/songs', requireAuth, async (req, res) => {
    const setlistId = req.params.id;
    const { saved_song_id } = req.body;
    
    if (!saved_song_id) return res.status(400).json({ error: 'saved_song_id parameter required.' });
    
    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');
        
        // 1. Verify setlist belongs to user
        const setlistCheck = await dbClient.query('SELECT id FROM public.setlists WHERE id = $1 AND user_id = $2', [setlistId, req.user.id]);
        if (setlistCheck.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Setlist not found.' });
        }
        
        // 2. Verify saved song belongs to user
        const songCheck = await dbClient.query('SELECT id FROM public.saved_songs WHERE id = $1 AND user_id = $2', [saved_song_id, req.user.id]);
        if (songCheck.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Saved song not found in library.' });
        }
        
        // 3. Find current trailing order number
        const orderRes = await dbClient.query('SELECT COALESCE(MAX(sort_order), -1) as last_order FROM public.setlist_songs WHERE setlist_id = $1', [setlistId]);
        const nextOrder = orderRes.rows[0].last_order + 1;
        
        // 4. Insert junction record
        await dbClient.query(
            'INSERT INTO public.setlist_songs (setlist_id, saved_song_id, sort_order) VALUES ($1, $2, $3)',
            [setlistId, saved_song_id, nextOrder]
        );
        
        await dbClient.query('COMMIT');
        res.status(201).json({ message: 'Song appended to setlist', sort_order: nextOrder });
    } catch (err) {
        await dbClient.query('ROLLBACK');
        console.error('[API Error] Appending to setlist failed:', err.message);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This song already exists in this setlist.' });
        }
        res.status(500).json({ error: 'Failed to append setlist item.' });
    } finally {
        dbClient.release();
    }
});

// PUT Reorder Setlist Songs (Transaction Safe Swaps)
// Takes an array of saved_song_ids in their exact new order, updating all indexes in a transaction.
app.put('/api/setlists/:id/reorder', requireAuth, async (req, res) => {
    const setlistId = req.params.id;
    const { ordered_song_ids } = req.body; // Array: ["uuid1", "uuid2", "uuid3"]
    
    if (!ordered_song_ids || !Array.isArray(ordered_song_ids)) {
        return res.status(400).json({ error: 'ordered_song_ids array parameter is required.' });
    }
    
    const dbClient = await pool.connect();
    try {
        await dbClient.query('BEGIN');
        
        // 1. Verify setlist belongs to user
        const setlistCheck = await dbClient.query('SELECT id FROM public.setlists WHERE id = $1 AND user_id = $2', [setlistId, req.user.id]);
        if (setlistCheck.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            return res.status(404).json({ error: 'Setlist not found.' });
        }
        
        // Because setlist_songs_sort_order_unique is DEFERRABLE INITIALLY DEFERRED,
        // we can safely execute updates that transiently duplicate positions,
        // since the constraint checks are deferred until the final COMMIT!
        
        // 2. Map new sort indexes
        for (let newIndex = 0; newIndex < ordered_song_ids.length; newIndex++) {
            const songId = ordered_song_ids[newIndex];
            const updateRes = await dbClient.query(
                `UPDATE public.setlist_songs 
                 SET sort_order = $1 
                 WHERE setlist_id = $2 AND saved_song_id = $3 
                 RETURNING saved_song_id`,
                [newIndex, setlistId, songId]
            );
            
            if (updateRes.rows.length === 0) {
                // Occurs if song ID sent does not belong to the target setlist
                await dbClient.query('ROLLBACK');
                return res.status(400).json({ error: `Song with ID ${songId} does not belong to this setlist.` });
            }
        }
        
        await dbClient.query('COMMIT');
        res.json({ message: 'Setlist order updated successfully.' });
    } catch (err) {
        await dbClient.query('ROLLBACK');
        console.error('[API Error] Reordering setlist failed:', err.message);
        res.status(500).json({ error: 'Failed to update song order within setlist.' });
    } finally {
        dbClient.release();
    }
});

// -------------------------------------------------------------------------
// ROUTE D: LIMIT CHECKS & CREDIT USAGE
// -------------------------------------------------------------------------

// GET Fetch user daily calls, caps, and credits
app.get('/api/user/limits', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT api_calls_count, api_calls_limit, credits_remaining, last_reset_at 
             FROM public.user_api_limits 
             WHERE user_id = $1`,
            [req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Limits record not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[API Error] Fetching limits failed:', err.message);
        res.status(500).json({ error: 'Failed to retrieve API limits profile.' });
    }
});
```

---

## 4. Best Practices for Production Deployment

### Security Checklist
* **Enforce HTTPS**: Force SSL on all incoming routes on Railway. Ensure Node client connects using standard SSL pool rules (`ssl: { rejectUnauthorized: false }`).
* **Environment Isolation**: Never place raw passwords, DB secrets, or JWT strings in code. Use Railway’s centralized secrets manager.
* **CORS Settings**: Set strict CORS headers in Express restricting client applications from accessing endpoints outside of standard app origins:
  ```javascript
  app.use(cors({
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      credentials: true
  }));
  ```

### Performance & Scaling
* **Database Connection Pooling**: Direct node-postgres connects cost ~20-30ms to create. Using `pg.Pool` reuse strategy limits active connections, keeps DB load steady, and serves queries under 5ms.
* **Optimized B-Trees**: Search performance is critical. We placed index triggers (`idx_saved_songs_user`, `idx_setlist_songs_order`) to ensure lookups and sort executions bypass expensive sequential tables.
* **Daily Cron Cleanups**: Implement a PG cron job or a daily scheduled Express background job that runs a midnight reset on the credit counters:
  ```sql
  -- Daily credit count refresh
  UPDATE public.user_api_limits
  SET api_calls_count = 0,
      credits_remaining = CASE 
          WHEN (SELECT billing_tier FROM public.profiles p WHERE p.id = user_id) = 'pro' THEN 250 
          ELSE 20 
      END,
      last_reset_at = NOW();
  ```
