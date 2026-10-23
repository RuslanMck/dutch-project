// GET /events (under /api): relays change events to open pages as server-sent events, with a ping that keeps
// proxies from closing the connection.
import express from 'express';

const PING_INTERVAL_MILLISECONDS = 25_000;

export function createServerSentEventsRoutes({ changeEventBus }) {
  const serverSentEventsRouter = express.Router();

  serverSentEventsRouter.get('/events', (request, response) => {
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write(': connected\n\n');
    const unsubscribe = changeEventBus.subscribeToChanges(changeEvent => {
      response.write(`event: change\ndata: ${JSON.stringify(changeEvent)}\n\n`);
    });
    const pingInterval = setInterval(() => response.write(': ping\n\n'), PING_INTERVAL_MILLISECONDS);
    request.on('close', () => {
      clearInterval(pingInterval);
      unsubscribe();
      response.end();
    });
  });

  return serverSentEventsRouter;
}
