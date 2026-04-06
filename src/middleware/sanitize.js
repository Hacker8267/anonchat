const { body, validationResult } = require('express-validator');

const sanitizeUsername = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('El nombre solo puede contener letras, números y guión bajo')
        .escape()
];

const sanitizeMessage = [
    body('contenido')
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('El mensaje debe tener entre 1 y 500 caracteres')
        .escape()
];

const sanitizePost = [
    body('titulo')
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('El título debe tener entre 3 y 100 caracteres')
        .escape(),
    body('contenido')
        .trim()
        .isLength({ min: 1, max: 5000 })
        .withMessage('El contenido debe tener entre 1 y 5000 caracteres')
        .escape()
];

function validateRequest(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
}

module.exports = {
    sanitizeUsername,
    sanitizeMessage,
    sanitizePost,
    validateRequest
};