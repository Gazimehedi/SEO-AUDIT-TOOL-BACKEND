"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const audit_1 = require("./api/routes/audit");
const auth_1 = require("./api/routes/auth");
const ai_1 = require("./api/routes/ai");
const user_1 = require("./api/routes/user");
const admin_1 = require("./api/routes/admin");
const competitors_1 = require("./api/routes/competitors");
const monitoring_1 = require("./api/routes/monitoring");
const projects_1 = require("./api/routes/projects");
const socket_1 = require("./socket");
const scheduler_1 = require("./scheduler");
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
exports.io = (0, socket_1.initSocket)(httpServer);
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Postman, same-server)
        if (!origin)
            return callback(null, true);
        // Allow any localhost / 127.0.0.1 origin during development
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
}));
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('dev'));
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/audit', audit_1.auditRouter);
app.use('/api/auth', auth_1.authRouter);
app.use('/api/ai', ai_1.aiRouter);
app.use('/api/user', user_1.userRouter);
app.use('/api/admin', admin_1.adminRouter);
app.use('/api/competitors', competitors_1.competitorsRouter);
app.use('/api/monitoring', monitoring_1.monitoringRouter);
app.use('/api/projects', projects_1.projectsRouter);
// Start monitoring scheduler (runs hourly)
(0, scheduler_1.startMonitoringScheduler)();
// Initialize Queue Worker after IO is ready
require("./queue");
// We will add routes here later
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
