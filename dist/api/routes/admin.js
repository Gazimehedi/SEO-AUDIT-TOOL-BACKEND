"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const os_1 = __importDefault(require("os"));
exports.adminRouter = (0, express_1.Router)();
// Apply admin guard to all routes here
exports.adminRouter.use(auth_1.authMiddleware);
exports.adminRouter.use(auth_1.requireAdmin);
// GET /api/admin/stats - Global Analytics
exports.adminRouter.get('/stats', async (req, res) => {
    try {
        const totalUsers = await db_1.prisma.user.count();
        const totalAudits = await db_1.prisma.audit.count();
        const failedAudits = await db_1.prisma.audit.count({ where: { status: 'failed' } });
        const completeAudits = await db_1.prisma.audit.count({ where: { status: 'complete' } });
        // Avg Score
        const audits = await db_1.prisma.audit.findMany({
            where: { status: 'complete' },
            select: { score: true }
        });
        const avgScore = audits.length > 0
            ? Math.round(audits.reduce((acc, a) => acc + (a.score || 0), 0) / audits.length)
            : 0;
        // System Health
        const system = {
            platform: os_1.default.platform(),
            cpuCount: os_1.default.cpus().length,
            freeMem: Math.round(os_1.default.freemem() / 1024 / 1024) + ' MB',
            totalMem: Math.round(os_1.default.totalmem() / 1024 / 1024) + ' MB',
            uptime: Math.round(os_1.default.uptime() / 60) + ' minutes'
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
    }
    catch (err) {
        console.error('Admin stats error:', err);
        return res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
});
// GET /api/admin/users - User Management List
exports.adminRouter.get('/users', async (req, res) => {
    try {
        const users = await db_1.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                _count: {
                    select: { audits: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(users);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// PATCH /api/admin/users/:id - Update user role/status
exports.adminRouter.patch('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    try {
        const user = await db_1.prisma.user.update({
            where: { id: id },
            data: { role }
        });
        return res.json(user);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update user' });
    }
});
// DELETE /api/admin/users/:id - Delete user + audits
exports.adminRouter.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Prisma cascade delete should handle audits if configured, 
        // but here we might need careful handling if not.
        // Assuming default behavior for now or manual delete.
        await db_1.prisma.audit.deleteMany({ where: { userId: id } });
        await db_1.prisma.user.delete({ where: { id: id } });
        return res.json({ message: 'User and their data deleted' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});
