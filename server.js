const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load custom modules
const logger = require('./logger');
const schemas = require('./validation');
const certUtils = require('./cert-utils');
const { 
    authLimiter, 
    apiLimiter, 
    errorHandler, 
    validateRequest, 
    authenticateToken, 
    activityLogger, 
    securityHeaders, 
    sanitizeInput 
} = require('./middleware');

// Initialize certificate utilities with logger
certUtils.init(logger);

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 7266;

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
(async () => {
    try {
        const connection = await pool.getConnection();
        logger.info('Database connection established');
        connection.release();
    } catch (error) {
        logger.error('Database connection failed', { error });
        process.exit(1);
    }
})();

// Apply security headers
app.use(securityHeaders);

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGIN 
        : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON requests
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Input sanitization
app.use(sanitizeInput);

// API rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

// Activity logging
app.use(activityLogger);

// Serve static files
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        // Generate secure filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Auth routes
app.post(
    '/api/auth/login', 
    validateRequest(schemas.login),
    async (req, res, next) => {
        try {
            const { email, password } = req.body;
            
            const [rows] = await pool.execute(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            
            if (rows.length === 0) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            
            const user = rows[0];
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (!validPassword) {
                return res.status(401).json({ message: 'Invalid credentials' });
            }
            
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role || 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // Log successful login
            logger.info(`User logged in: ${user.id}`, { userId: user.id, email: user.email });
            
            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role || 'user'
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/api/auth/register',
    validateRequest(schemas.registerUser),
    async (req, res, next) => {
        try {
            const { email, password, name } = req.body;
            
            // Check if user already exists
            const [existing] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            
            if (existing.length > 0) {
                return res.status(400).json({ message: 'Email already registered' });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Create user
            const [result] = await pool.execute(
                'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
                [email, hashedPassword, name, 'user'] // Default role is 'user'
            );
            
            const token = jwt.sign(
                { id: result.insertId, email, role: 'user' },
                process.env.JWT_SECRET,
                { expiresIn: '24h' }
            );
            
            // Log user creation
            logger.info(`New user registered: ${result.insertId}`, { userId: result.insertId, email });
            
            res.status(201).json({
                token,
                user: {
                    id: result.insertId,
                    email,
                    name,
                    role: 'user'
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

// Items routes
app.get('/api/items', async (req, res, next) => {
    try {
        // Parse query parameters for filtering
        const { 
            category, 
            minPrice, 
            maxPrice, 
            search,
            sort = 'newest',
            page = 1,
            limit = 20
        } = req.query;
        
        // Build the base query
        let query = `
            SELECT items.*, users.name as seller_name 
            FROM items 
            JOIN users ON items.seller_id = users.id
            WHERE items.sold = FALSE
        `;
        
        const queryParams = [];
        
        // Add filters
        if (category) {
            query += ' AND items.category = ?';
            queryParams.push(category);
        }
        
        if (minPrice) {
            query += ' AND items.current_price >= ?';
            queryParams.push(parseFloat(minPrice));
        }
        
        if (maxPrice) {
            query += ' AND items.current_price <= ?';
            queryParams.push(parseFloat(maxPrice));
        }
        
        if (search) {
            query += ' AND (items.name LIKE ? OR items.description LIKE ?)';
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm);
        }
        
        // Add sorting
        switch (sort) {
            case 'price-asc':
                query += ' ORDER BY items.current_price ASC';
                break;
            case 'price-desc':
                query += ' ORDER BY items.current_price DESC';
                break;
            default:
                query += ' ORDER BY items.created_at DESC';
        }
        
        // Add pagination
        const offset = (page - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        queryParams.push(parseInt(limit), parseInt(offset));
        
        // Execute the query
        const [rows] = await pool.execute(query, queryParams);
        
        // Get total count for pagination
        let countQuery = `
            SELECT COUNT(*) as total
            FROM items
            WHERE items.sold = FALSE
        `;
        
        const countParams = [];
        
        if (category) {
            countQuery += ' AND items.category = ?';
            countParams.push(category);
        }
        
        if (minPrice) {
            countQuery += ' AND items.current_price >= ?';
            countParams.push(parseFloat(minPrice));
        }
        
        if (maxPrice) {
            countQuery += ' AND items.current_price <= ?';
            countParams.push(parseFloat(maxPrice));
        }
        
        if (search) {
            countQuery += ' AND (items.name LIKE ? OR items.description LIKE ?)';
            const searchTerm = `%${search}%`;
            countParams.push(searchTerm, searchTerm);
        }
        
        const [countResult] = await pool.execute(countQuery, countParams);
        const totalItems = countResult[0].total;
        
        res.json({
            items: rows,
            pagination: {
                total: totalItems,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalItems / limit)
            }
        });
    } catch (error) {
        next(error);
    }
});

app.post(
    '/api/items', 
    authenticateToken(),
    upload.single('image'),
    validateRequest(schemas.createItem),
    async (req, res, next) => {
        try {
            const {
                name,
                description,
                startPrice,
                minPrice,
                category
            } = req.body;
            
            if (!req.file) {
                return res.status(400).json({ message: 'Image is required' });
            }
            
            const imageUrl = `/uploads/${req.file.filename}`;
            
            const [result] = await pool.execute(`
                INSERT INTO items (
                    name, description, start_price, current_price,
                    min_price, image_url, category, seller_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                name,
                description,
                startPrice,
                startPrice, // Initial current_price equals start_price
                minPrice,
                imageUrl,
                category,
                req.user.id
            ]);
            
            logger.info(`New item created: ${result.insertId}`, { 
                itemId: result.insertId,
                userId: req.user.id,
                category
            });
            
            res.status(201).json({
                id: result.insertId,
                name,
                description,
                startPrice: parseFloat(startPrice),
                currentPrice: parseFloat(startPrice),
                minPrice: parseFloat(minPrice),
                imageUrl,
                category,
                sellerId: req.user.id,
                createdAt: new Date(),
                lastPriceUpdate: new Date()
            });
        } catch (error) {
            next(error);
        }
    }
);

app.patch(
    '/api/items/:id', 
    authenticateToken(),
    validateRequest(schemas.updatePrice),
    async (req, res, next) => {
        try {
            const { currentPrice, lastPriceUpdate } = req.body;
            const itemId = req.params.id;
            
            // Verify the item belongs to the user
            const [items] = await pool.execute(
                'SELECT * FROM items WHERE id = ?',
                [itemId]
            );
            
            if (items.length === 0) {
                return res.status(404).json({ message: 'Item not found' });
            }
            
            const item = items[0];
            
            if (item.seller_id !== req.user.id && req.user.role !== 'admin') {
                return res.status(403).json({ message: 'Not authorized to update this item' });
            }
            
            // Ensure price is not below minimum
            if (parseFloat(currentPrice) < parseFloat(item.min_price)) {
                return res.status(400).json({ message: 'Price cannot be lower than minimum price' });
            }
            
            await pool.execute(
                'UPDATE items SET current_price = ?, last_price_update = ? WHERE id = ?',
                [currentPrice, lastPriceUpdate, itemId]
            );
            
            logger.info(`Item price updated: ${itemId}`, { 
                itemId,
                userId: req.user.id,
                oldPrice: item.current_price,
                newPrice: currentPrice
            });
            
            res.json({ 
                message: 'Price updated successfully',
                item: {
                    id: itemId,
                    currentPrice: parseFloat(currentPrice),
                    lastPriceUpdate: new Date(lastPriceUpdate)
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

app.post('/api/items/:id/purchase', authenticateToken(), async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const itemId = req.params.id;
        
        // Get item details
        const [items] = await connection.execute(
            'SELECT * FROM items WHERE id = ? AND sold = FALSE',
            [itemId]
        );
        
        if (items.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Item not found or already sold' });
        }
        
        const item = items[0];
        
        // Prevent users from buying their own items
        if (item.seller_id === req.user.id) {
            await connection.rollback();
            return res.status(400).json({ message: 'You cannot buy your own item' });
        }
        
        // Update item as sold
        await connection.execute(
            'UPDATE items SET sold = TRUE, buyer_id = ? WHERE id = ?',
            [req.user.id, itemId]
        );
        
        // Create purchase record
        await connection.execute(
            'INSERT INTO purchases (item_id, buyer_id, purchase_price) VALUES (?, ?, ?)',
            [itemId, req.user.id, item.current_price]
        );
        
        await connection.commit();
        
        logger.info(`Item purchased: ${itemId}`, { 
            itemId,
            buyerId: req.user.id,
            sellerId: item.seller_id,
            price: item.current_price
        });
        
        res.json({ 
            message: 'Purchase successful',
            purchase: {
                itemId,
                name: item.name,
                price: parseFloat(item.current_price),
                purchaseDate: new Date()
            }
        });
    } catch (error) {
        await connection.rollback();
        next(error);
    } finally {
        connection.release();
    }
});

// User profile and history routes
app.get('/api/users/me', authenticateToken(), async (req, res, next) => {
    try {
        const [rows] = await pool.execute(
            'SELECT id, email, name, role, created_at FROM users WHERE id = ?',
            [req.user.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        next(error);
    }
});

app.get('/api/users/me/items', authenticateToken(), async (req, res, next) => {
    try {
        const [rows] = await pool.execute(`
            SELECT * FROM items 
            WHERE seller_id = ? 
            ORDER BY created_at DESC
        `, [req.user.id]);
        
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

app.get('/api/users/me/purchases', authenticateToken(), async (req, res, next) => {
    try {
        const [rows] = await pool.execute(`
            SELECT p.*, i.name, i.description, i.image_url, i.category, u.name as seller_name
            FROM purchases p
            JOIN items i ON p.item_id = i.id
            JOIN users u ON i.seller_id = u.id
            WHERE p.buyer_id = ?
            ORDER BY p.purchase_date DESC
        `, [req.user.id]);
        
        res.json(rows);
    } catch (error) {
        next(error);
    }
});

// Categories list
app.get('/api/categories', async (req, res) => {
    // Return available categories
    const categories = [
        { id: 'electronics', name: 'Electronics' },
        { id: 'furniture', name: 'Furniture' },
        { id: 'clothing', name: 'Clothing' },
        { id: 'books', name: 'Books' },
        { id: 'other', name: 'Other' }
    ];
    
    res.json(categories);
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Load HTTPS certificates if available
const domain = process.env.DOMAIN || '11oclocktoast.com';
const httpsOptions = certUtils.loadCertificates(domain);

// Configure HTTP server based on environment
const httpServer = http.createServer((req, res) => {
    // In production with HTTPS enabled, redirect all HTTP traffic to HTTPS
    if (httpsOptions && (process.env.NODE_ENV === 'production' || process.env.ENFORCE_HTTPS === 'true')) {
        const host = req.headers.host || domain;
        res.writeHead(301, { 'Location': `https://${host}${req.url}` });
        res.end();
    } else {
        // Otherwise, handle the request normally with Express
        app(req, res);
    }
});

// Start HTTP server
const httpPort = process.env.HTTP_PORT || 7265;
httpServer.listen(httpPort, () => {
    logger.info(`HTTP server running on port ${httpPort}`);
});

// Start HTTPS server if certificates are available
if (httpsOptions) {
    const httpsPort = process.env.HTTPS_PORT || 7266;
    const httpsServer = https.createServer(httpsOptions, app);
    
    httpsServer.listen(httpsPort, () => {
        logger.info(`HTTPS server running on port ${httpsPort}`);
        
        // Setup certificate renewal checking (check once a day)
        certUtils.setupCertificateRenewal(httpsServer, domain);
    });
} else if (process.env.NODE_ENV === 'production') {
    logger.warn('Running in production without HTTPS is not recommended');
    logger.info(`Please ensure Let's Encrypt certificates are available at /etc/letsencrypt/live/${domain}/`);
}
