const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getDb } = require('../database/db');
const { agregarCreditos } = require('../services/creditos');
const config = require('../config/env');
const logger = require('../utils/logger');
const axios = require('axios');

const router = express.Router();

router.use(verifyToken);

// Obtener productos
router.get('/productos', async (req, res) => {
    try {
        const db = getDb();
        const productos = await db.all(`
            SELECT id, nombre, creditos, precio_usd
            FROM productos_tienda
            WHERE activo = 1
            ORDER BY creditos ASC
        `);
        
        res.json(productos);
        
    } catch (error) {
        logger.error('Error obteniendo productos:', error);
        res.status(500).json({ error: 'Error al obtener productos' });
    }
});

// Crear orden de pago con MercadoPago
router.post('/mercadopago/crear-orden', async (req, res) => {
    try {
        const { productoId } = req.body;
        const db = getDb();
        
        if (!config.MERCADOPAGO_ACCESS_TOKEN) {
            return res.status(400).json({ error: 'MercadoPago no está configurado' });
        }
        
        const producto = await db.get(`
            SELECT * FROM productos_tienda WHERE id = ? AND activo = 1
        `, [productoId]);
        
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        const response = await axios.post('https://api.mercadopago.com/checkout/preferences', {
            items: [{
                title: producto.nombre,
                quantity: 1,
                unit_price: producto.precio_usd,
                currency_id: 'USD'
            }],
            payer: {
                email: `user_${req.user.id}@anonimo.com`
            },
            external_reference: `user_${req.user.id}_producto_${productoId}`,
            notification_url: `${req.protocol}://${req.get('host')}/api/tienda/mercadopago/webhook`
        }, {
            headers: {
                'Authorization': `Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`
            }
        });
        
        res.json({ init_point: response.data.init_point, preference_id: response.data.id });
        
    } catch (error) {
        logger.error('Error creando orden MercadoPago:', error);
        res.status(500).json({ error: 'Error al crear orden de pago' });
    }
});

// Webhook de MercadoPago
router.post('/mercadopago/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;
        
        if (type === 'payment') {
            const paymentId = data.id;
            
            const response = await axios.get(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${config.MERCADOPAGO_ACCESS_TOKEN}`
                }
            });
            
            const payment = response.data;
            
            if (payment.status === 'approved') {
                const externalRef = payment.external_reference;
                const [_, userId, productId] = externalRef.split('_');
                
                const db = getDb();
                const producto = await db.get('SELECT creditos FROM productos_tienda WHERE id = ?', [productId]);
                
                if (producto) {
                    await agregarCreditos(
                        parseInt(userId),
                        producto.creditos,
                        'compra',
                        `Compra de ${producto.creditos} créditos vía MercadoPago`,
                        payment.transaction_amount,
                        'MercadoPago',
                        paymentId
                    );
                    
                    logger.info(`Pago aprobado MercadoPago: usuario ${userId}, ${producto.creditos} créditos`);
                }
            }
        }
        
        res.sendStatus(200);
        
    } catch (error) {
        logger.error('Error en webhook MercadoPago:', error);
        res.sendStatus(500);
    }
});

// Crear orden con PayPal
router.post('/paypal/crear-orden', async (req, res) => {
    try {
        const { productoId } = req.body;
        const db = getDb();
        
        if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) {
            return res.status(400).json({ error: 'PayPal no está configurado' });
        }
        
        const producto = await db.get(`
            SELECT * FROM productos_tienda WHERE id = ? AND activo = 1
        `, [productoId]);
        
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        
        const auth = Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString('base64');
        
        const tokenResponse = await axios.post('https://api-m.sandbox.paypal.com/v1/oauth2/token', 
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const accessToken = tokenResponse.data.access_token;
        
        const orderResponse = await axios.post('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
            intent: 'CAPTURE',
            purchase_units: [{
                reference_id: `user_${req.user.id}_producto_${productoId}`,
                amount: {
                    currency_code: 'USD',
                    value: producto.precio_usd
                },
                description: producto.nombre
            }],
            application_context: {
                return_url: `${req.protocol}://${req.get('host')}/tienda.html?success=true`,
                cancel_url: `${req.protocol}://${req.get('host')}/tienda.html?cancel=true`
            }
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const approvalUrl = orderResponse.data.links.find(link => link.rel === 'approve').href;
        
        res.json({ approval_url: approvalUrl, order_id: orderResponse.data.id });
        
    } catch (error) {
        logger.error('Error creando orden PayPal:', error);
        res.status(500).json({ error: 'Error al crear orden de pago' });
    }
});

// Capturar pago PayPal
router.post('/paypal/capturar', async (req, res) => {
    try {
        const { orderId } = req.body;
        
        if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) {
            return res.status(400).json({ error: 'PayPal no está configurado' });
        }
        
        const auth = Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString('base64');
        
        const tokenResponse = await axios.post('https://api-m.sandbox.paypal.com/v1/oauth2/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        const accessToken = tokenResponse.data.access_token;
        
        const captureResponse = await axios.post(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {}, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const purchase = captureResponse.data.purchase_units[0];
        const [_, userId, productId] = purchase.reference_id.split('_');
        
        const db = getDb();
        const producto = await db.get('SELECT creditos FROM productos_tienda WHERE id = ?', [productId]);
        
        if (producto) {
            await agregarCreditos(
                parseInt(userId),
                producto.creditos,
                'compra',
                `Compra de ${producto.creditos} créditos vía PayPal`,
                parseFloat(purchase.amount.value),
                'PayPal',
                captureResponse.data.id
            );
            
            logger.info(`Pago capturado PayPal: usuario ${userId}, ${producto.creditos} créditos`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error capturando pago PayPal:', error);
        res.status(500).json({ error: 'Error al capturar pago' });
    }
});

// Historial de compras del usuario
router.get('/historial-compras', async (req, res) => {
    try {
        const db = getDb();
        const compras = await db.all(`
            SELECT cantidad, descripcion, monto_pagado, metodo_pago, fecha
            FROM transacciones_creditos
            WHERE usuario_id = ? AND tipo = 'compra'
            ORDER BY fecha DESC LIMIT 50
        `, [req.user.id]);
        
        res.json(compras);
        
    } catch (error) {
        logger.error('Error obteniendo historial de compras:', error);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

module.exports = router;