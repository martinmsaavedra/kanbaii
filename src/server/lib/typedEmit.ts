import { Server } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents } from '../../shared/types';

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

let io: TypedServer | null = null;

export function setIO(server: TypedServer): void {
  io = server;
}

export function getIO(): TypedServer {
  if (!io) throw new Error('Socket.IO not initialized — call setIO() first');
  return io;
}

export function emit<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  getIO().emit(event, ...args);
}
