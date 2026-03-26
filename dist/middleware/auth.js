"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.optionalAuthMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const authMiddleware = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Token is not valid' });
    }
};
exports.authMiddleware = authMiddleware;
const optionalAuthMiddleware = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
        return next();
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
    }
    catch (err) {
        // Ignore invalid tokens for optional routes
    }
    next();
};
exports.optionalAuthMiddleware = optionalAuthMiddleware;
const db_1 = require("../config/db");
const requireAdmin = async (req, res, next) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: req.user.userId } });
        if (user?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        next();
    }
    catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.requireAdmin = requireAdmin;
