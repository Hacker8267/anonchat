const { getDb } = require('../database/db');

async function agregarCreditos(usuarioId, cantidad, tipo, descripcion, montoPagado = null, metodoPago = null, referenciaPago = null) {
    const db = getDb();
    
    await db.run('BEGIN TRANSACTION');
    
    try {
        await db.run(
            'UPDATE usuarios SET creditos = creditos + ? WHERE id = ?',
            [cantidad, usuarioId]
        );
        
        await db.run(`
            INSERT INTO transacciones_creditos 
            (usuario_id, cantidad, tipo, descripcion, monto_pagado, metodo_pago, referencia_pago)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [usuarioId, cantidad, tipo, descripcion, montoPagado, metodoPago, referenciaPago]);
        
        await db.run('COMMIT');
        
        const nuevoTotal = await db.get(
            'SELECT creditos FROM usuarios WHERE id = ?',
            [usuarioId]
        );
        
        return { success: true, creditos: nuevoTotal.creditos };
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

async function gastarCreditos(usuarioId, cantidad, tipo, descripcion) {
    const db = getDb();
    
    const usuario = await db.get('SELECT creditos FROM usuarios WHERE id = ?', [usuarioId]);
    
    if (!usuario || usuario.creditos < cantidad) {
        return { success: false, error: 'Créditos insuficientes' };
    }
    
    await db.run('BEGIN TRANSACTION');
    
    try {
        await db.run(
            'UPDATE usuarios SET creditos = creditos - ? WHERE id = ?',
            [cantidad, usuarioId]
        );
        
        await db.run(`
            INSERT INTO transacciones_creditos (usuario_id, cantidad, tipo, descripcion)
            VALUES (?, ?, ?, ?)
        `, [usuarioId, -cantidad, tipo, descripcion]);
        
        await db.run('COMMIT');
        
        const nuevoTotal = await db.get(
            'SELECT creditos FROM usuarios WHERE id = ?',
            [usuarioId]
        );
        
        return { success: true, creditos: nuevoTotal.creditos };
    } catch (error) {
        await db.run('ROLLBACK');
        throw error;
    }
}

async function verificarCreditoDiario(usuarioId) {
    const db = getDb();
    const usuario = await db.get(
        'SELECT ultimo_credito_diario FROM usuarios WHERE id = ?',
        [usuarioId]
    );
    
    if (!usuario) return false;
    
    const hoy = new Date().toDateString();
    const ultimo = usuario.ultimo_credito_diario ? new Date(usuario.ultimo_credito_diario).toDateString() : null;
    
    if (ultimo !== hoy) {
        await agregarCreditos(
            usuarioId,
            require('../config/env').CREDITS_POR_DIA,
            'recompensa',
            'Recompensa diaria'
        );
        
        await db.run(
            'UPDATE usuarios SET ultimo_credito_diario = ? WHERE id = ?',
            [new Date().toISOString(), usuarioId]
        );
        
        return true;
    }
    
    return false;
}

module.exports = {
    agregarCreditos,
    gastarCreditos,
    verificarCreditoDiario
};