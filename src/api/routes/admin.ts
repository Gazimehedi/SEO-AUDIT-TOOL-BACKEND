import { Router, Response } from 'express';
import { prisma } from '../../config/db';
import { authMiddleware, AuthRequest, requireAdmin } from '../../middleware/auth';
import os from 'os';

export const adminRouter = Router();

// Apply admin guard to all routes here
adminRouter.use(authMiddleware);
adminRouter.use(requireAdmin);

// GET /api/admin/stats - Global Analytics
adminRouter.get('/stats', async (req: AuthRequest, res: Response) => {
    try {
        const totalUsers = await prisma.user.count();
        const totalAudits = await prisma.audit.count();
        const failedAudits = await prisma.audit.count({ where: { status: 'failed' } });
        const completeAudits = await prisma.audit.count({ where: { status: 'complete' } });
        
        // Avg Score
        const audits = await prisma.audit.findMany({
            where: { status: 'complete' },
            select: { score: true }
        });
        const avgScore = audits.length > 0 
            ? Math.round(audits.reduce((acc, a) => acc + (a.score || 0), 0) / audits.length) 
            : 0;

        // System Health
        const system = {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            freeMem: Math.round(os.freemem() / 1024 / 1024) + ' MB',
            totalMem: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
            uptime: Math.round(os.uptime() / 60) + ' minutes'
        };

        return res.json({
            users: totalUsers,
            audits: {
                total: totalAudits,
                failed: failedAudits,
                complete: completeAudits,
                avgScore
            },
            system
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        return res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
});

// GET /api/admin/users - User Management List
adminRouter.get('/users', async (req: AuthRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                _count: {
                    select: { audits: true }
                }
            } as any,
            orderBy: { createdAt: 'desc' } as any
        });
        return res.json(users);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PATCH /api/admin/users/:id - Update user role/status
adminRouter.patch('/users/:id', async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
        const user = await prisma.user.update({
            where: { id: id as string },
            data: { role } as any
        });
        return res.json(user);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE /api/admin/users/:id - Delete user + audits
adminRouter.delete('/users/:id', async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    try {
        // Prisma cascade delete should handle audits if configured, 
        // but here we might need careful handling if not.
        // Assuming default behavior for now or manual delete.
        await prisma.audit.deleteMany({ where: { userId: id as string } });
        await prisma.user.delete({ where: { id: id as string } });
        return res.json({ message: 'User and their data deleted' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});
