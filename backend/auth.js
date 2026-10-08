const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'chordgenius_secret_jwt_key_worship_stage_2026';
const JWT_EXPIRES_IN = '30d';

/**
 * Hash a plain password using bcrypt.
 */
async function hashPassword(plainPassword) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plainPassword, salt);
}

/**
 * Compare plain password against a stored hash.
 */
async function comparePassword(plainPassword, hash) {
    return bcrypt.compare(plainPassword, hash);
}

/**
 * Generate a JWT token for a user.
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            name: user.name
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Express middleware that enforces authentication.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.cookies?.token || req.query?.token;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
    }
}

/**
 * Express middleware that optionally attaches authenticated user if present.
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7).trim() 
        : req.cookies?.token || req.query?.token;

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (err) {
        req.user = null;
    }
    next();
}

module.exports = {
    hashPassword,
    comparePassword,
    generateToken,
    requireAuth,
    optionalAuth
};
