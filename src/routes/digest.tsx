import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/read-night.js';
import { lane } from '../lane.js';
import { Digest } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function createDigestRouter(config: RigConfig) {
  const router = new Hono();

  router.get('/:night', async (c) => {
    const digest = await readNight(config.runsDir, c.req.param('night'));

    return c.html(
      <Layout title={`digest · ${digest.night}`} lane={lane()}>
        <Digest digest={digest} />
      </Layout>,
      digest.found ? 200 : 404,
    );
  });

  return router;
}
