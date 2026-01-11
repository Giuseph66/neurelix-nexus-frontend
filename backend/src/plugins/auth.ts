import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { userId: string; email?: string };
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      // Prefer built-in verifier from @fastify/jwt
      const decoded = (await (req as any).jwtVerify()) as { userId: string; email?: string };
      req.user = decoded;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });
}
