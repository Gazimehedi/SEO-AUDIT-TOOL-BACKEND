"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../../config/db");
exports.authRouter = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
// Register
exports.authRouter.post('/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const existingUser = await db_1.prisma.user.findUnique({ where: { email } });
        if (existingUser)
            return res.status(400).json({ error: 'User already exists' });
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await db_1.prisma.user.create({
            data: { email, password: hashedPassword }
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.status(201).json({ user: { id: user.id, email: user.email }, token });
    }
    catch (err) {
        return res.status(500).json({ error: 'Registration failed' });
    }
});
// Login
exports.authRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await db_1.prisma.user.findUnique({ where: { email } });
        if (!user)
            return res.status(400).json({ error: 'Invalid credentials' });
        const isMatch = await bcrypt_1.default.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.json({ user: { id: user.id, email: user.email }, token });
    }
    catch (err) {
        return res.status(500).json({ error: 'Login failed' });
    }
});
// Logout
exports.authRouter.post('/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ message: 'Logged out' });
});
// Get current user (me)
exports.authRouter.get('/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await db_1.prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        return res.json({ id: user.id, email: user.email });
    }
    catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
});
