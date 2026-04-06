const { getDb } = require('../database/db');

let palabrasProhibidasCache = null;
let lastUpdate = 0;
const CACHE_TTL = 300000;

async function cargarPalabrasProhibidas() {
    const now = Date.now();
    if (palabrasProhibidasCache && (now - lastUpdate) < CACHE_TTL) {
        return palabrasProhibidasCache;
    }
    
    const db = getDb();
    const palabras = await db.all('SELECT palabra FROM palabras_prohibidas');
    palabrasProhibidasCache = palabras.map(p => p.palabra.toLowerCase());
    lastUpdate = now;
    
    return palabrasProhibidasCache;
}

async function filtrarInsultos(texto) {
    if (!texto) return texto;
    
    const palabras = await cargarPalabrasProhibidas();
    let textoFiltrado = texto;
    
    for (const palabra of palabras) {
        const regex = new RegExp(`\\b${palabra}\\b`, 'gi');
        textoFiltrado = textoFiltrado.replace(regex, '***');
    }
    
    return textoFiltrado;
}

async function contieneInsultos(texto) {
    if (!texto) return false;
    
    const palabras = await cargarPalabrasProhibidas();
    const textoLower = texto.toLowerCase();
    
    for (const palabra of palabras) {
        if (textoLower.includes(palabra)) {
            return true;
        }
    }
    
    return false;
}

async function agregarPalabraProhibida(palabra, severidad = 1) {
    const db = getDb();
    try {
        await db.run(
            'INSERT INTO palabras_prohibidas (palabra, severidad) VALUES (?, ?)',
            [palabra.toLowerCase(), severidad]
        );
        palabrasProhibidasCache = null;
        return true;
    } catch (error) {
        return false;
    }
}

async function eliminarPalabraProhibida(palabra) {
    const db = getDb();
    try {
        await db.run('DELETE FROM palabras_prohibidas WHERE palabra = ?', [palabra.toLowerCase()]);
        palabrasProhibidasCache = null;
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    filtrarInsultos,
    contieneInsultos,
    agregarPalabraProhibida,
    eliminarPalabraProhibida
};