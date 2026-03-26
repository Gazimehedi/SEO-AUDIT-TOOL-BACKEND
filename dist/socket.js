"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = exports.io = void 0;
const socket_io_1 = require("socket.io");
const initSocket = (httpServer) => {
    exports.io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
        },
    });
    exports.io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
    return exports.io;
};
exports.initSocket = initSocket;
