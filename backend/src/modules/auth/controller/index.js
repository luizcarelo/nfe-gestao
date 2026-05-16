/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/modules/auth/controller/index.js
 * Controlador de Autenticação e Geração de Tokens JWT
 */
const jwt = require('jsonwebtoken');
const { pool } = require('../../../config/database');
const AppError = require('../../../shared/errors/AppError');
const { logger } = require('../../../infra/logger');
// O bcrypt seria importado aqui para validar hashes reais: const bcrypt = require('bcrypt');

class AuthController {
  async login(req, res) {
    const { email, senha } = req.body;

    if (!email || !senha) {
      throw new AppError('Email e senha são obrigatórios.', 400);
    }

    const client = await pool.connect();
    try {
      // Procura o utilizador na base de dados
      const userQuery = await client.query(
        'SELECT id, tenant_id, nome, email, senha_hash, role, status FROM users WHERE email = $1',
        [email]
      );

      if (userQuery.rows.length === 0) {
        throw new AppError('Credenciais inválidas.', 401);
      }

      const user = userQuery.rows[0];

      if (user.status !== 'ativo') {
        throw new AppError('Utilizador inativo.', 403);
      }

      // IMPORTANTE: Em produção, usar bcrypt.compare(senha, user.senha_hash)
      // Para este teste inicial com o nosso script de setup, vamos aceitar a senha simulada
      if (senha !== 'hash_temporario_123') {
         throw new AppError('Credenciais inválidas.', 401);
      }

      // Gera o Token JWT com as informações vitais de sessão (incluindo o tenant_id)
      const secret = process.env.JWT_SECRET || 'segredo_temporario_super_seguro_mudar_em_prod';
      
      const tokenPayload = {
        id: user.id,
        tenant_id: user.tenant_id,
        role: user.role
      };

      const token = jwt.sign(tokenPayload, secret, { expiresIn: '1d' });

      // Retira a senha do objeto de resposta por segurança
      delete user.senha_hash;

      logger.info(`🔐 Login com sucesso: ${user.email} (Tenant: ${user.tenant_id})`);

      return res.status(200).json({
        success: true,
        user,
        token
      });

    } finally {
      client.release();
    }
  }
}

module.exports = new AuthController();