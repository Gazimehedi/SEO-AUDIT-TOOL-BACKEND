import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';
import { auditRouter } from './api/routes/audit';
import { authRouter } from './api/routes/auth';
import { aiRouter } from './api/routes/ai';
import { userRouter } from './api/routes/user';
import { adminRouter } from './api/routes/admin';
import { competitorsRouter } from './api/routes/competitors';
import { monitoringRouter } from './api/routes/monitoring';
import { projectsRouter } from './api/routes/projects';
import { initSocket } from './socket';
import { startMonitoringScheduler } from './scheduler';
import path from 'path';

const app = express();
const httpServer = createServer(app);
export const io = initSocket(httpServer);

app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman, same-server)
        if (!origin) return callback(null, true);
        // Allow any localhost / 127.0.0.1 origin during development
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }

        // Allow production domain
        const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '').toLowerCase().trim();
        const normalizeOrigin = origin.replace(/\/$/, '').toLowerCase().trim();
        
        if (frontendUrl && normalizeOrigin === frontendUrl) {
            return callback(null, true);
        }

        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use(helmet());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/audit', auditRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/user', userRouter);
app.use('/api/admin', adminRouter);
app.use('/api/competitors', competitorsRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/projects', projectsRouter);

// Start monitoring scheduler (runs hourly)
startMonitoringScheduler();

// Initialize Queue Worker after IO is ready
import './queue';

// We will add routes here later

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
