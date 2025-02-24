const Joi = require('joi');

const schemas = {
    // User registration schema
    registerUser: Joi.object({
        email: Joi.string()
            .email()
            .required()
            .max(255)
            .messages({
                'string.email': 'Please provide a valid email address',
                'string.max': 'Email must be less than 255 characters'
            }),
        
        password: Joi.string()
            .required()
            .min(8)
            .max(72) // bcrypt max length
            .pattern(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/)
            .messages({
                'string.pattern.base': 'Password must contain at least one letter and one number',
                'string.min': 'Password must be at least 8 characters long'
            }),
        
        name: Joi.string()
            .required()
            .min(2)
            .max(255)
            .pattern(/^[a-zA-Z\s'-]+$/)
            .messages({
                'string.pattern.base': 'Name can only contain letters, spaces, hyphens, and apostrophes'
            })
    }),

    // Login schema
    login: Joi.object({
        email: Joi.string()
            .email()
            .required()
            .max(255),
        
        password: Joi.string()
            .required()
            .max(72)
    }),

    // Item creation schema
    createItem: Joi.object({
        name: Joi.string()
            .required()
            .min(3)
            .max(255)
            .messages({
                'string.min': 'Item name must be at least 3 characters long'
            }),
        
        description: Joi.string()
            .required()
            .min(10)
            .max(1000)
            .messages({
                'string.min': 'Description must be at least 10 characters long'
            }),
        
        startPrice: Joi.number()
            .required()
            .min(1)
            .max(1000000)
            .messages({
                'number.min': 'Starting price must be at least $1',
                'number.max': 'Starting price cannot exceed $1,000,000'
            }),
        
        minPrice: Joi.number()
            .required()
            .min(0)
            .max(Joi.ref('startPrice'))
            .messages({
                'number.min': 'Minimum price cannot be negative',
                'number.max': 'Minimum price cannot be higher than starting price'
            }),
        
        category: Joi.string()
            .required()
            .valid('electronics', 'furniture', 'clothing', 'books', 'other')
            .messages({
                'any.only': 'Invalid category selected'
            })
    }),

    // Price update schema
    updatePrice: Joi.object({
        currentPrice: Joi.number()
            .required()
            .min(0)
            .messages({
                'number.min': 'Current price cannot be negative'
            }),
        
        lastPriceUpdate: Joi.date()
            .iso()
            .required()
            .messages({
                'date.base': 'Invalid date format for price update'
            })
    })
};

module.exports = schemas;
