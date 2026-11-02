import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/read-night.js';

export function createDigestApiRouter(config: RigConfig) {
  const router = new Hono();

  router.get('/:night', async (c) => {
    const digest = await readNight(config.runsDir, c.req.param('night'));
    return c.json(digest, digest.found ? 200 : 404);
  });

  return router;
}
