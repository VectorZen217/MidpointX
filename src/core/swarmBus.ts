import type { Server } from "socket.io";

let _io: Server | null = null;

export const SwarmBus = {
  init(io: Server): void {
    _io = io;
  },

  emit(event: string, payload: object): void {
    if (_io) {
      _io.emit(event, payload);
    }
  }
};
