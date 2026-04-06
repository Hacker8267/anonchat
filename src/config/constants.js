module.exports = {
    // Roles
    ROLES: {
        ADMIN: 'admin',
        USER: 'user'
    },
    
    // Transaction types
    TRANSACTION_TYPES: {
        COMPRA: 'compra',
        RECOMPENSA: 'recompensa',
        GASTO: 'gasto',
        INVITACION: 'invitacion'
    },
    
    // Audit actions
    AUDIT_ACTIONS: {
        LOGIN_ADMIN: 'login_admin',
        VER_IP: 'ver_ip',
        BLOQUEAR_USUARIO: 'bloquear_usuario',
        DESBLOQUEAR_USUARIO: 'desbloquear_usuario',
        ELIMINAR_MENSAJE: 'eliminar_mensaje',
        ELIMINAR_POST: 'eliminar_post',
        CAMBIAR_CREDITOS: 'cambiar_creditos',
        VER_DATOS_SENSIBLES: 'ver_datos_sensibles'
    },
    
    // Username restrictions
    USERNAME: {
        MIN_LENGTH: 3,
        MAX_LENGTH: 20,
        PATTERN: /^[a-zA-Z0-9_]+$/,
        RESERVED: ['admin', 'administrador', 'system', 'moderador']
    },
    
    // Message limits
    MESSAGE: {
        MAX_LENGTH: 500,
        MIN_LENGTH: 1
    },
    
    // Post limits
    POST: {
        TITLE_MAX_LENGTH: 100,
        CONTENT_MAX_LENGTH: 5000
    },
    
    // Cache
    CACHE: {
        TTL: 60, // seconds
        MAX_MESSAGES: 100,
        MAX_POSTS: 50
    },
    
    // Pagination
    PAGINATION: {
        MESSAGES_PER_PAGE: 50,
        POSTS_PER_PAGE: 20,
        COMMENTS_PER_PAGE: 30
    }
};