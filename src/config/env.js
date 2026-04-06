require('dotenv').config();
const path = require('path');

module.exports = {
    // Server
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Security
    JWT_SECRET: process.env.JWT_SECRET,
    SESSION_SECRET: process.env.SESSION_SECRET,
    
    // RSA Keys
    RSA_PUBLIC_KEY_PATH: path.resolve(process.env.RSA_PUBLIC_KEY_PATH || './keys/public.pem'),
    RSA_PRIVATE_KEY_PATH: path.resolve(process.env.RSA_PRIVATE_KEY_PATH || './keys/private.pem'),
    
    // Database
    DATABASE_URL: process.env.DATABASE_URL || './data/database.sqlite',
    DATABASE_ENCRYPTION_KEY: process.env.DATABASE_ENCRYPTION_KEY,
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    
    // Credits System
    CREDITS_REGISTRO_INICIAL: parseInt(process.env.CREDITS_REGISTRO_INICIAL) || 3,
    CREDITS_POR_DIA: parseInt(process.env.CREDITS_POR_DIA) || 1,
    CREDITS_POR_INVITACION: parseInt(process.env.CREDITS_POR_INVITACION) || 5,
    CAMBIO_NOMBRE_COSTO: parseInt(process.env.CAMBIO_NOMBRE_COSTO) || 5,
    CAMBIO_NOMBRE_COSTO_DESCUENTO: parseInt(process.env.CAMBIO_NOMBRE_COSTO_DESCUENTO) || 3,
    CAMBIO_NOMBRE_DIAS_DESCUENTO: parseInt(process.env.CAMBIO_NOMBRE_DIAS_DESCUENTO) || 7,
    
    // Payments
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    
    // Admin
    ADMIN_IP_WHITELIST: process.env.ADMIN_IP_WHITELIST ? process.env.ADMIN_IP_WHITELIST.split(',') : [],
    ADMIN_ALERT_EMAIL: process.env.ADMIN_ALERT_EMAIL,
    
    // WebSocket
    SOCKET_PING_INTERVAL: parseInt(process.env.SOCKET_PING_INTERVAL) || 25000,
    SOCKET_PING_TIMEOUT: parseInt(process.env.SOCKET_PING_TIMEOUT) || 20000
};