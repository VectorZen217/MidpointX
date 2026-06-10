import type { Server } from "socket.io";

let _io: Server | null = null;

export const SwarmBus = {
  init(io: Server): void {
    if (_io) {
      console.warn("[SwarmBus] init() called more than once — overwriting existing io instance");
    }
    _io = io;
  },

  emit(event: string, payload: Record<string, unknown>): void {
    if (!_io) {
      console.warn(`[SwarmBus] emit("${event}") called before init() — event dropped`);
      return;
    }
    _io.emit(event, payload);
  }
};
