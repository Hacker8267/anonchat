const crypto = require('crypto');

function generateFingerprint(req) {
    const components = [
        req.ip || req.connection.remoteAddress,
        req.headers['user-agent'] || 'unknown',
        req.headers['accept-language'] || 'unknown',
        req.headers['accept-encoding'] || 'unknown',
        req.headers['sec-ch-ua'] || 'unknown',
        req.headers['sec-ch-ua-platform'] || 'unknown',
        req.headers['sec-ch-ua-mobile'] || 'unknown'
    ];
    
    const fingerprintString = components.join('|');
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
    
    return hash;
}

function getDeviceInfo(userAgent) {
    const ua = userAgent || '';
    const info = {
        tipo: 'desconocido',
        sistema: 'desconocido',
        navegador: 'desconocido',
        version: 'desconocido'
    };
    
    if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
        info.tipo = 'móvil';
    } else if (ua.includes('Tablet') || ua.includes('iPad')) {
        info.tipo = 'tablet';
    } else {
        info.tipo = 'escritorio';
    }
    
    if (ua.includes('Windows')) info.sistema = 'Windows';
    else if (ua.includes('Mac OS')) info.sistema = 'MacOS';
    else if (ua.includes('Android')) info.sistema = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) info.sistema = 'iOS';
    else if (ua.includes('Linux')) info.sistema = 'Linux';
    
    if (ua.includes('Chrome') && !ua.includes('Edg')) info.navegador = 'Chrome';
    else if (ua.includes('Firefox')) info.navegador = 'Firefox';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) info.navegador = 'Safari';
    else if (ua.includes('Edg')) info.navegador = 'Edge';
    else if (ua.includes('Opera')) info.navegador = 'Opera';
    
    return info;
}

module.exports = {
    generateFingerprint,
    getDeviceInfo
};