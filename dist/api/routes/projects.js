"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectsRouter = void 0;
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
exports.projectsRouter = (0, express_1.Router)();
/**
 * GET /api/projects - List all projects for the current user
 */
exports.projectsRouter.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const projects = await db_1.prisma.project.findMany({
            where: { userId: req.user.userId },
            include: {
                _count: {
                    select: { audits: true, monitoredSites: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(projects);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch projects' });
    }
});
/**
 * POST /api/projects - Create a new project
 */
exports.projectsRouter.post('/', auth_1.authMiddleware, async (req, res) => {
    const { name, description } = req.body;
    const userId = req.user.userId;
    if (!name)
        return res.status(400).json({ error: 'Project name is required' });
    try {
        const project = await db_1.prisma.project.create({
            data: { name, description, userId }
        });
        return res.status(201).json(project);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to create project' });
    }
});
/**
 * GET /api/projects/:id - Get project details including its audits and monitored sites
 */
exports.projectsRouter.get('/:id', auth_1.authMiddleware, async (req, res) => {
    const id = req.params.id;
    try {
        const project = await db_1.prisma.project.findUnique({
            where: { id },
            include: {
                audits: { orderBy: { createdAt: 'desc' } },
                monitoredSites: true
            }
        });
        if (!project)
            return res.status(404).json({ error: 'Project not found' });
        if (project.userId !== req.user.userId)
            return res.status(403).json({ error: 'Unauthorized' });
        return res.json(project);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch project details' });
    }
});
/**
 * DELETE /api/projects/:id - Delete a project
 */
exports.projectsRouter.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    const id = req.params.id;
    try {
        const project = await db_1.prisma.project.findUnique({ where: { id } });
        if (!project)
            return res.status(404).json({ error: 'Project not found' });
        if (project.userId !== req.user.userId)
            return res.status(403).json({ error: 'Unauthorized' });
        // Note: For now, we'll just set projectId to null in audits/monitoredSites
        // Or we could cascade delete. Let's just disconnect them for safety.
        await db_1.prisma.audit.updateMany({
            where: { projectId: id },
            data: { projectId: null }
        });
        await db_1.prisma.monitoredSite.updateMany({
            where: { projectId: id },
            data: { projectId: null }
        });
        await db_1.prisma.project.delete({ where: { id } });
        return res.json({ message: 'Project deleted successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to delete project' });
    }
});
/**
 * PATCH /api/projects/:id - Update project details
 */
exports.projectsRouter.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    const id = req.params.id;
    const { name, description } = req.body;
    try {
        const project = await db_1.prisma.project.findUnique({ where: { id } });
        if (!project)
            return res.status(404).json({ error: 'Project not found' });
        if (project.userId !== req.user.userId)
            return res.status(403).json({ error: 'Unauthorized' });
        const updated = await db_1.prisma.project.update({
            where: { id },
            data: { name, description }
        });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update project' });
    }
});
