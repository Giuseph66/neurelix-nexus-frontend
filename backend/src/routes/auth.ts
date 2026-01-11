import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { z } from 'zod';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

type UserRow = {
  id: string;
  email: string;
  encrypted_password: string;
  raw_user_meta_data: any;
};

type ProfileRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function signAccessToken(app: FastifyInstance, userId: string, email: string) {
  return app.jwt.sign(
    { userId, email },
    { expiresIn: app.env.JWT_ACCESS_TTL_SECONDS }
  );
}

async function issueRefreshToken(app: FastifyInstance, userId: string, req: FastifyRequest) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = sha256Hex(refreshToken);

  // expires_at based on configured TTL
  const expiresAt = new Date(Date.now() + app.env.JWT_REFRESH_TTL_SECONDS * 1000);

  await app.db.query(
    `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at, created_ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      expiresAt.toISOString(),
      (req.ip || null) as any,
      (req.headers['user-agent'] || null) as any,
    ]
  );

  return refreshToken;
}

async function loadProfile(app: FastifyInstance, userId: string) {
  const profileResult = await app.db.query<ProfileRow>(
    'SELECT id, user_id, full_name, avatar_url FROM public.profiles WHERE user_id = $1',
    [userId]
  );
  return profileResult.rows[0] || null;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/signup
  app.post('/auth/signup', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = signupSchema.parse(req.body);

    const existing = await app.db.query<{ id: string }>(
      'SELECT id FROM auth.users WHERE email = $1',
      [body.email]
    );

    if (existing.rows.length > 0) {
      return reply.code(400).send({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const userId = crypto.randomUUID();

    await app.db.query(
      `INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [userId, body.email, passwordHash, { full_name: body.fullName }]
    );

    await app.db.query(
      `INSERT INTO public.profiles (user_id, full_name, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name`,
      [userId, body.fullName]
    );

    const profile = await loadProfile(app, userId);

    const accessToken = signAccessToken(app, userId, body.email);
    const refreshToken = await issueRefreshToken(app, userId, req);

    return reply.send({
      user: {
        id: userId,
        email: body.email,
        user_metadata: { full_name: body.fullName },
      },
      profile,
      tokens: { accessToken, refreshToken },
    });
  });

  // POST /auth/login
  app.post('/auth/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(req.body);

    const userResult = await app.db.query<UserRow>(
      'SELECT id, email, encrypted_password, raw_user_meta_data FROM auth.users WHERE email = $1',
      [body.email]
    );

    if (userResult.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    const valid = await bcrypt.compare(body.password, user.encrypted_password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const profile = await loadProfile(app, user.id);

    const accessToken = signAccessToken(app, user.id, user.email);
    const refreshToken = await issueRefreshToken(app, user.id, req);

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.raw_user_meta_data || {},
      },
      profile,
      tokens: { accessToken, refreshToken },
    });
  });

  // GET /auth/me
  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const userResult = await app.db.query<{ id: string; email: string; raw_user_meta_data: any }>(
        'SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const profile = await loadProfile(app, userId);

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.raw_user_meta_data || {},
        },
        profile,
      });
    }
  );

  // POST /auth/refresh
  app.post('/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = refreshSchema.parse(req.body);

    const tokenHash = sha256Hex(body.refreshToken);

    const rt = await app.db.query<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM auth.refresh_tokens
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (rt.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    const row = rt.rows[0];
    if (row.revoked_at) {
      return reply.code(401).send({ error: 'Refresh token revoked' });
    }

    if (new Date(row.expires_at) < new Date()) {
      return reply.code(401).send({ error: 'Refresh token expired' });
    }

    // Revoke old
    await app.db.query('UPDATE auth.refresh_tokens SET revoked_at = NOW() WHERE id = $1', [row.id]);

    // Load user
    const userResult = await app.db.query<{ id: string; email: string }>(
      'SELECT id, email FROM auth.users WHERE id = $1',
      [row.user_id]
    );

    if (userResult.rows.length === 0) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    const accessToken = signAccessToken(app, user.id, user.email);
    const refreshToken = await issueRefreshToken(app, user.id, req);

    return reply.send({ tokens: { accessToken, refreshToken } });
  });
}
