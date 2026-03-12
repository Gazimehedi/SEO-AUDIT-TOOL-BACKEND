import { Router } from 'express';
import { prisma } from '../../config/db';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import crypto from 'crypto';

export const userRouter = Router();

// GET /api/user/profile
userRouter.get('/profile', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                _count: {
                    select: { audits: true }
                }
            }
        });
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Calculate avg score
        const audits = await prisma.audit.findMany({
            where: { userId },
            select: { score: true }
        });
        const validScores = audits.filter(a => a.score !== null).map(a => a.score as number);
        const avgScore = validScores.length > 0 ? Math.round(validScores.reduce((a, b: any) => a + b, 0) / validScores.length) : 0;

        const { password, twoFactorSecret, ...userData } = user as any;
        return res.json({
            ...userData,
            stats: {
                totalAudits: user._count.audits,
                avgScore
            }
        });
    } catch (err) {
        console.error('Profile fetch error:', err);
        return res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// PATCH /api/user/profile
userRouter.patch('/profile', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { name, bio, avatarUrl, reportLogoUrl } = req.body;
    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { name, bio, avatarUrl, reportLogoUrl } as any
        });
        const { password, twoFactorSecret, ...userData } = user as any;
        return res.json(userData);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});

// PATCH /api/user/notifications
userRouter.patch('/notifications', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { notifyOnScoreDrop, notifyWeekly } = req.body;
    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { notifyOnScoreDrop, notifyWeekly } as any
        });
        return res.json({ notifyOnScoreDrop: user.notifyOnScoreDrop, notifyWeekly: user.notifyWeekly });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// PATCH /api/user/password
userRouter.patch('/password', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, (user as any).password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect current password' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });
        return res.json({ message: 'Password updated successfully' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update password' });
    }
});

// POST /api/user/2fa/setup
userRouter.post('/2fa/setup', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email, 'SEO Tool', secret);
        const qrCodeUrl = await qrcode.toDataURL(otpauth);

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: secret } as any
        });

        return res.json({ qrCodeUrl, secret });
    } catch (err) {
        return res.status(500).json({ error: '2FA Setup failed' });
    }
});

// POST /api/user/2fa/verify
userRouter.post('/2fa/verify', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { token } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !(user as any).twoFactorSecret) {
            return res.status(400).json({ error: '2FA not set up' });
        }

        const isValid = authenticator.check(token, (user as any).twoFactorSecret);
        if (!isValid) return res.status(400).json({ error: 'Invalid token' });

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabled: true } as any
        });

        return res.json({ message: '2FA enabled successfully' });
    } catch (err) {
        return res.status(500).json({ error: '2FA Verification failed' });
    }
});

// POST /api/user/api-keys
userRouter.post('/api-keys', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const { label } = req.body;

    try {
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = await bcrypt.hash(rawToken, 10);

        const apiKey = await prisma.apiKey.create({
            data: {
                label,
                token: hashedToken,
                userId
            }
        });

        return res.json({ id: apiKey.id, label: apiKey.label, token: rawToken });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to create API key' });
    }
});

// GET /api/user/api-keys
userRouter.get('/api-keys', authMiddleware, async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    try {
        const keys = await prisma.apiKey.findMany({
            where: { userId },
            select: { id: true, label: true, lastUsed: true, createdAt: true }
        });
        return res.json(keys);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch API keys' });
    }
});

// DELETE /api/user/api-keys/:id
userRouter.delete('/api-keys/:id', authMiddleware, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.userId;
    try {
        await prisma.apiKey.deleteMany({
            where: {
                id: id as string,
                userId
            }
        });
        return res.json({ message: 'API key revoked' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to revoke key' });
    }
});

import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

userRouter.post('/avatar', authMiddleware, upload.single('avatar'), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const userId = req.user!.userId;
    const avatarUrl = `/uploads/${req.file.filename}`;
    
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl } as any
        });
        return res.json({ avatarUrl });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update avatar' });
    }
});

userRouter.post('/report-logo', authMiddleware, upload.single('logo'), async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    const userId = req.user!.userId;
    const reportLogoUrl = `/uploads/${req.file.filename}`;
    
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { reportLogoUrl } as any
        });
        return res.json({ reportLogoUrl });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update report logo' });
    }
});
