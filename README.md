# Price Drop Marketplace

A mobile-first marketplace application where item prices automatically reduce by $1 every hour until they reach a seller-defined minimum price. After reaching the minimum price, the price resets to the original asking price and the cycle continues.

## Features

- Mobile-first responsive design
- Automatic price reduction system
- User authentication and registration
- Image upload for item listings
- Advanced search and filtering
- Secure API with rate limiting
- Activity logging and monitoring

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Authentication**: JWT (JSON Web Tokens)
- **File Uploads**: Multer
- **Validation**: Joi
- **Security**: Helmet, bcrypt, express-rate-limit
- **Logging**: Winston

## Project Structure

```
price-drop-marketplace/
├── public/                  # Static assets
│   ├── uploads/             # User uploaded images
│   ├── index.html           # Main HTML file
│   ├── styles.css           # CSS styles
│   └── app.js               # Frontend JavaScript
├── logs/                    # Application logs
├── middleware.js            # Express middleware
├── validation.js            # Input validation schemas
├── logger.js                # Logging configuration
├── server.js                # Main server file
├── schema.sql               # Database schema
├── .env                     # Environment variables
└── package.json             # Project dependencies
```

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8 or higher)
- npm or yarn

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/price-drop-marketplace.git
cd price-drop-marketplace
```

2. **Install dependencies**

```bash
npm install
```

3. **Create environment file**

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
```

4. **Set up the database**

```bash
# Create the database and tables
mysql -u your_username -p < schema.sql
```

5. **Create required directories**

```bash
mkdir -p public/uploads logs
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will be available at `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login a user

### Items

- `GET /api/items` - Get all available items (with filtering)
- `POST /api/items` - Create a new item listing (requires authentication)
- `PATCH /api/items/:id` - Update an item's price (requires authentication)
- `POST /api/items/:id/purchase` - Purchase an item (requires authentication)

### User Profile

- `GET /api/users/me` - Get current user profile
- `GET /api/users/me/items` - Get items listed by current user
- `GET /api/users/me/purchases` - Get purchases made by current user

### Categories

- `GET /api/categories` - Get all available categories

## Security Features

- HTTPS recommended for production
- Password hashing with bcrypt
- JWT authentication
- Input validation and sanitization
- Rate limiting to prevent brute force attacks
- CORS protection
- Helmet security headers
- File upload restrictions

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
