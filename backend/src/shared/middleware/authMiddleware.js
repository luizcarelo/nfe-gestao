/**
 * Ficheiro: /home/luizcarelo/nfe-gestao/backend/src/shared/middleware/authMiddleware.js
 * Middleware para validar o Token JWT e injetar o contexto do utilizador e tenant.
 */
const jwt = require('jsonwebtoken');
const AppError = require('../errors/AppError');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError('Token JWT não fornecido.', 401);
  }

  // Esperado formato "Bearer <token>"
  const [, token] = authHeader.split(' ');

  if (!token) {
    throw new AppError('Formato do Token JWT inválido.', 401);
  }

  try {
    const secret = process.env.JWT_SECRET || 'segredo_temporario_super_seguro_mudar_em_prod';
    
    // Descodifica e verifica se o token não expirou ou foi adulterado
    const decoded = jwt.verify(token, secret);

    // Injeta os dados do utilizador (incluindo o vital tenant_id) no request
    req.user = {
      id: decoded.id,
      tenant_id: decoded.tenant_id,
      role: decoded.role
    };

    return next();
  } catch (err) {
    throw new AppError('Token JWT inválido ou expirado.', 401);
  }
};

module.exports = authMiddleware;