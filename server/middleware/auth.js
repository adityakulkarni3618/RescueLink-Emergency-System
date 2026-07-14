const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../utils/redis');

const { JWT_SECRET } = require('../utils/config');

/**
 * Middleware to verify JWT token and user roles.
 * @param {string[]} requiredRoles - List of allowed roles. If empty, any authenticated user is allowed.
 */
function verifyToken(requiredRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        console.log(`[AUTH] Access denied: No token provided for ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized: Access token required' });
      }

      // Check if token is blacklisted (logged out)
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        console.log(`[AUTH] Access denied: Token is blacklisted for ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          console.log(`[AUTH] Access denied: Invalid or expired token for ${req.method} ${req.originalUrl}`);
          return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
        }

        // Verify MFA status on token structure
        if (decoded.requiresMFA || decoded.requiresMfaSetup) {
          console.log(`[AUTH] Access denied: MFA verification pending for ${req.method} ${req.originalUrl}`);
          return res.status(403).json({ error: 'Forbidden: Complete Multi-factor authentication first' });
        }

        // Check user roles if required
        if (requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
          console.log(`[AUTH] Access denied: Role '${decoded.role}' not authorized for ${req.method} ${req.originalUrl}`);
          return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        }

        // Attach user info to request
        req.user = {
          id: decoded.id,
          name: decoded.name,
          email: decoded.email,
          role: decoded.role,
          hospital_id: decoded.hospital_id
        };

        console.log(`[AUTH] Access granted: User ${req.user.email} (${req.user.role}) -> ${req.method} ${req.originalUrl}`);
        next();
      });
    } catch (err) {
      console.error('[AUTH ERROR] Middleware execution failed:', err);
      return res.status(500).json({ error: 'Internal Server Error in authentication' });
    }
  };
}

module.exports = {
  verifyToken
};
