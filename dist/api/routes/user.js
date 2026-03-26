"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const bcrypt_1 = __importDefault(require("bcrypt"));
const otplib_1 = require("otplib");
const qrcode = __importStar(require("qrcode"));
const crypto_1 = __importDefault(require("crypto"));
exports.userRouter = (0, express_1.Router)();
// GET /api/user/profile
exports.userRouter.get('/profile', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                _count: {
                    select: { audits: true }
                }
            }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Calculate avg score
        const audits = await db_1.prisma.audit.findMany({
            where: { userId },
            select: { score: true }
        });
        const validScores = audits.filter(a => a.score !== null).map(a => a.score);
        const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;
        const { password, twoFactorSecret, ...userData } = user;
        return res.json({
            ...userData,
            stats: {
                totalAudits: user._count.audits,
                avgScore
            }
        });
    }
    catch (err) {
        console.error('Profile fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
// PATCH /api/user/profile
exports.userRouter.patch('/profile', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { name, bio, avatarUrl, reportLogoUrl } = req.body;
    try {
        const user = await db_1.prisma.user.update({
            where: { id: userId },
            data: { name, bio, avatarUrl, reportLogoUrl }
        });
        const { password, twoFactorSecret, ...userData } = user;
        return res.json(userData);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});
// PATCH /api/user/notifications
exports.userRouter.patch('/notifications', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { notifyOnScoreDrop, notifyWeekly } = req.body;
    try {
        const user = await db_1.prisma.user.update({
            where: { id: userId },
            data: { notifyOnScoreDrop, notifyWeekly }
        });
        return res.json({ notifyOnScoreDrop: user.notifyOnScoreDrop, notifyWeekly: user.notifyWeekly });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update notifications' });
    }
});
// PATCH /api/user/password
exports.userRouter.patch('/password', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const isMatch = await bcrypt_1.default.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(400).json({ error: 'Incorrect current password' });
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        return res.json({ message: 'Password updated successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update password' });
    }
});
// POST /api/user/2fa/setup
exports.userRouter.post('/2fa/setup', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const secret = otplib_1.authenticator.generateSecret();
        const otpauth = otplib_1.authenticator.keyuri(user.email, 'SEO Tool', secret);
        const qrCodeUrl = await qrcode.toDataURL(otpauth);
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: secret }
        });
        return res.json({ qrCodeUrl, secret });
    }
    catch (err) {
        return res.status(500).json({ error: '2FA Setup failed' });
    }
});
// POST /api/user/2fa/verify
exports.userRouter.post('/2fa/verify', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { token } = req.body;
    try {
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.twoFactorSecret) {
            return res.status(400).json({ error: '2FA not set up' });
        }
        const isValid = otplib_1.authenticator.check(token, user.twoFactorSecret);
        if (!isValid)
            return res.status(400).json({ error: 'Invalid token' });
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true }
        });
        return res.json({ message: '2FA enabled successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: '2FA Verification failed' });
    }
});
// POST /api/user/api-keys
exports.userRouter.post('/api-keys', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    const { label } = req.body;
    try {
        const rawToken = crypto_1.default.randomBytes(32).toString('hex');
        const hashedToken = await bcrypt_1.default.hash(rawToken, 10);
        const apiKey = await db_1.prisma.apiKey.create({
            data: {
                label,
                token: hashedToken,
                userId
            }
        });
        return res.json({ id: apiKey.id, label: apiKey.label, token: rawToken });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to create API key' });
    }
});
// GET /api/user/api-keys
exports.userRouter.get('/api-keys', auth_1.authMiddleware, async (req, res) => {
    const userId = req.user.userId;
    try {
        const keys = await db_1.prisma.apiKey.findMany({
            where: { userId },
            select: { id: true, label: true, lastUsed: true, createdAt: true }
        });
        return res.json(keys);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});
// DELETE /api/user/api-keys/:id
exports.userRouter.delete('/api-keys/:id', auth_1.authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
        await db_1.prisma.apiKey.deleteMany({
            where: {
                id: id,
                userId
            }
        });
        return res.json({ message: 'API key revoked' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to revoke key' });
    }
});
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only images are allowed'));
        }
    }
});
exports.userRouter.post('/avatar', auth_1.authMiddleware, upload.single('avatar'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.userId;
    const avatarUrl = `/uploads/${req.file.filename}`;
    try {
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { avatarUrl }
        });
        return res.json({ avatarUrl });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update avatar' });
    }
});
exports.userRouter.post('/report-logo', auth_1.authMiddleware, upload.single('logo'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    const userId = req.user.userId;
    const reportLogoUrl = `/uploads/${req.file.filename}`;
    try {
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { reportLogoUrl }
        });
        return res.json({ reportLogoUrl });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update report logo' });
    }
});
