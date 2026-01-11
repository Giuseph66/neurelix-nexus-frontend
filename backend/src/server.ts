import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { loadEnv } from './plugins/env.js';
import { createPool } from './db/pool.js';
import { authRoutes } from './routes/auth.js';
import { projectRoutes } from './routes/projects.js';
import { whiteboardRoutes } from './routes/whiteboards.js';
import { functionsRoutes } from './routes/functions.js';
import { mentionsRoutes } from './routes/mentions.js';
import { boardRoutes } from './routes/boards.js';
import { tarefaRoutes } from './routes/tarefas.js';
import { boardViewRoutes } from './routes/board-views.js';
import { workflowRoutes } from './routes/workflows.js';
import { sprintRoutes } from './routes/sprints.js';

const env = loadEnv();

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  // Liberado para qualquer Origin (Fastify irá refletir o Origin do request).
  origin: true,
  credentials: true,
});
await app.register(sensible);
await app.register(websocket, {
  options: {
    maxPayload: 20 * 1024 * 1024,
  },
});

await app.register(jwt, {
  secret: env.JWT_SECRET,
});

// Global auth preHandler (não encapsulado)
app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const decoded = (await (req as any).jwtVerify()) as { userId: string; email?: string };
    (req as any).user = decoded;
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
});

await app.register(swagger, {
  openapi: {
    info: {
      title: 'Neurelix Local Backend',
      version: '0.1.0',
    },
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });

app.decorate('env', env);
app.decorate('db', createPool(env.DATABASE_URL));

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(projectRoutes);
await app.register(whiteboardRoutes);
await app.register(mentionsRoutes);
await app.register(functionsRoutes);
await app.register(boardRoutes);
await app.register(tarefaRoutes);
await app.register(boardViewRoutes);
await app.register(workflowRoutes);
await app.register(sprintRoutes);

declare module 'fastify' {
  interface FastifyInstance {
    env: ReturnType<typeof loadEnv>;
    db: ReturnType<typeof createPool>;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

await app.listen({ port: env.PORT, host: '0.0.0.0' });
