const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Rate limiting configuration
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: { error: message },
        standardHeaders: true,
        legacyHeaders: false
    });
};

// Rate limiters for different endpoints
const authLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 requests
    'Too many login attempts. Please try again later.'
);

const apiLimiter = createRateLimiter(
    60 * 1000, // 1 minute
    100, // 100 requests
    'Too many requests. Please try again later.'
);

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.details
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            details: 'Invalid or expired token'
        });
    }

    if (err.name === 'MulterError') {
        return res.status(400).json({
            error: 'File Upload Error',
            details: err.message
        });
    }

    // Default error
    res.status(500).json({
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
};

// Request validation middleware
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'Validation Error',
                details: error.details.map(detail => detail.message)
            });
        }
        next();
    };
};

// Authentication middleware with role checking
const authenticateToken = (requiredRole = null) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Unauthorized',
                details: 'Missing authentication token'
            });
        }

        try {
            const user = jwt.verify(token, process.env.JWT_SECRET);
            req.user = user;

            if (requiredRole && user.role !== requiredRole) {
                return res.status(403).json({
                    error: 'Forbidden',
                    details: 'Insufficient permissions'
                });
            }

            next();
        } catch (err) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Invalid or expired token'
            });
        }
    };
};

// Activity logging middleware
const activityLogger = async (req, res, next) => {
    const startTime = Date.now();
    const { method, path, ip, user } = req;

    res.on('finish', async () => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        const userId = user ? user.id : null;

        try {
            await pool.execute(
                'INSERT INTO activity_logs (user_id, method, path, status, duration, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, method, path, status, duration, ip]
            );
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    });

    next();
};

// Security headers middleware
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            scriptSrc: ["'self'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: true,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "same-origin" },
    xssFilter: true
});

// Sanitize request body middleware
const sanitizeInput = (req, res, next) => {
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key]
                    .trim()
                    .replace(/[<>]/g, '') // Basic XSS prevention
                    .slice(0, 1000); // Limit string length
            }
        });
    }
    next();
};

module.exports = {
    authLimiter,
    apiLimiter,
    errorHandler,
    validateRequest,
    authenticateToken,
    activityLogger,
    securityHeaders,
    sanitizeInput
};
