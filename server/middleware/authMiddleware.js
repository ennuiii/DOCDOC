const jwt = require('jsonwebtoken');
require('dotenv').config(); // To access JWT_SECRET from .env

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * @desc    Middleware to protect routes by verifying JWT token
 *          It adds the decoded user payload to the request object (req.user)
 */
const protect = (req, res, next) => {
    let token;

    // Check if token is sent in the Authorization header (Bearer token)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header (e.g., "Bearer <token>")
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Add user from payload to request object
            // We want to make sure we're not fetching the password, even if it's hashed
            // This assumes your User model's `findById` will not select password by default,
            // or you use .select('-password') if needed when fetching user details.
            // For now, just attaching the decoded payload is often sufficient for authorization checks.
            req.user = decoded.user; // The payload was { user: { id, role, username } }

            next(); // Proceed to the protected route
        } catch (error) {
            console.error('Token verification failed:', error.message);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ message: 'Not authorized, token failed.' });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Not authorized, token expired.' });
            }
            return res.status(401).json({ message: 'Not authorized, token issue.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token provided.' });
    }
};

/**
 * @desc    Middleware to authorize users based on their roles
 * @param   roles   Array of roles that are allowed to access the route
 * @example authorize(['admin', 'doctor'])
 */
const authorize = (roles = []) => {
    // roles param can be a single role string (e.g., 'admin')
    // or an array of roles (e.g., ['admin', 'doctor'])
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(403).json({ message: 'User role not found. Forbidden.' });
        }
        if (roles.length && !roles.includes(req.user.role)) {
            // User's role is not authorized
            return res.status(403).json({
                message: `Forbidden. User role '${req.user.role}' is not authorized to access this resource.`
            });
        }
        // Role is authorized
        next();
    };
};


module.exports = { protect, authorize };
