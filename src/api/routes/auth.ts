import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Register
authRouter.post('/register', async (req, res) => {
    const { email, password } = req.body;

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword } as any
        });

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.status(201).json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        return res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
authRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(400).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, (user as any).password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        return res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
authRouter.post('/logout', (req, res) => {
    res.clearCookie('token');
    return res.json({ message: 'Logged out' });
});

// Get current user (me)
authRouter.get('/me', async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        return res.json({ id: user.id, email: user.email });
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
});
