import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

export let io: Server;

export const initSocket = (httpServer: HttpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
        },
    });

    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        
        socket.on('join-job', (jobId) => {
            socket.join(jobId);
            // console.log(`Socket ${socket.id} joined room: ${jobId}`);
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
};
