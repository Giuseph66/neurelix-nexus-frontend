import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';

const SYSTEM_PROMPT = `Você é o Super-Agente, um assistente de IA amigável e criativo integrado a um quadro branco colaborativo.

Suas capacidades:
1. **Gerar ideias e textos**: Crie sugestões de brainstorming, textos para post-its, tópicos para discussão
2. **Resumir e organizar**: Ajude a sintetizar informações e organizar pensamentos
3. **Criar elementos**: Sugira layouts, estruturas visuais e como organizar elementos no board
4. **Responder perguntas**: Tire dúvidas sobre o projeto e ofereça orientações

Diretrizes:
- Seja conciso e prático nas respostas
- Use português brasileiro
- Quando sugerir elementos visuais, descreva-os de forma clara
- Forneça listas numeradas ou com bullets quando apropriado
- Seja amigável mas profissional

Quando o usuário pedir para criar elementos, responda em formato JSON estruturado:
{
  "type": "graph",
  "nodes": [
    { "id": "node1", "type": "postit", "text": "Ideia Principal", "color": "yellow" },
    { "id": "node2", "type": "rectangle", "text": "Ação 1", "color": "blue" },
    { "id": "node3", "type": "diamond", "text": "Decisão?", "color": "white" }
  ],
  "edges": [
    { "from": "node1", "to": "node2", "label": "gera" },
    { "from": "node2", "to": "node3" }
  ]
}

Regras para geração:
1. Use "postit" para ideias e notas.
2. Use "rectangle" para processos ou ações.
3. Use "diamond" para decisões.
4. Use "circle" para início/fim.
5. O texto dos post-its deve ser conciso. Se for longo, quebre em múltiplos nós conectados.
6. Crie conexões lógicas (edges) para formar um fluxo ou mapa mental.
7. Garanta que todos os IDs nos edges existam nos nodes.
8. Toda decisão ("diamond") deve ter duas saídas com labels claros: "Sim" e "Não".

Para outras respostas, use texto normal formatado em markdown.`;

const ANALYZE_SELECTION_PREFIX = '[ANALYZE_SELECTION]';
const TASK_PLAN_TYPE = 'task_plan';
const MAX_TASKS_PER_PLAN = 40;
const DEFAULT_STATUS_COLORS = ['#6B7280', '#3B82F6', '#A855F7', '#F59E0B', '#10B981', '#EF4444'];

const TASK_TYPES = new Set(['EPIC', 'TASK', 'SUBTASK', 'BUG', 'STORY']);
const TASK_PRIORITIES = new Set(['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST']);

function summarizeAnalyzeSelection(content: string): string {
  const match = content.match(/^\[ANALYZE_SELECTION\]\s*count=(\d+)/i);
  const count = match ? Number(match[1]) : NaN;
  if (Number.isFinite(count) && count > 0) {
    return `Enviei ${count} ${count === 1 ? 'elemento' : 'elementos'} para análise.`;
  }
  return 'Enviei elementos para análise.';
}

function normalizeLabel(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const match = text.match(/\{[\s\S]*"type"\s*:\s*"task_plan"[\s\S]*\}/i);
  if (match && match[0]) return match[0];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function convertMessagesToGeminiFormat(messages: any[]) {
  const geminiContents: any[] = [];
  let systemPrompt = "";

  const userMessages = messages.filter(msg => {
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      return false;
    }
    return true;
  });

  for (const msg of userMessages) {
    if (msg.role === "user") {
      const userText = geminiContents.length === 0 && systemPrompt
        ? `${systemPrompt}\n\n${msg.content}`
        : msg.content;

      geminiContents.push({
        role: "user",
        parts: [{ text: userText }]
      });
    } else if (msg.role === "assistant") {
      geminiContents.push({
        role: "model",
        parts: [{ text: msg.content }]
      });
    }
  }

  if (geminiContents.length === 0 && systemPrompt) {
    geminiContents.push({
      role: "user",
      parts: [{ text: systemPrompt }]
    });
  }

  return geminiContents;
}

/**
 * Rotas compatíveis com /functions/v1/* para manter compatibilidade
 * com o frontend que ainda espera esses endpoints
 */
export async function functionsRoutes(app: FastifyInstance) {
  // --- Project Invites (compat: /functions/v1/project-invites) ---

  const inviteEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function getProjectRole(projectId: string, userId: string): Promise<'admin' | 'tech_lead' | 'developer' | 'viewer' | null> {
    const { rows } = await app.db.query<{ role: any }>(
      'SELECT role FROM public.project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    return (rows[0]?.role as any) ?? null;
  }

  async function ensureProjectAccess(projectId: string, userId: string): Promise<boolean> {
    const role = await getProjectRole(projectId, userId);
    return Boolean(role);
  }

  async function ensureWhiteboardAccess(whiteboardId: string, userId: string): Promise<boolean> {
    const { rows } = await app.db.query<{ project_id: string }>(
      'SELECT project_id FROM public.whiteboards WHERE id = $1',
      [whiteboardId]
    );
    const projectId = rows[0]?.project_id;
    if (!projectId) return false;
    const role = await getProjectRole(projectId, userId);
    return Boolean(role);
  }

  // GET /functions/v1/project-invites?projectId=xxx
  app.get(
    '/functions/v1/project-invites',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const projectId = (req.query as any)?.projectId as string | undefined;
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });

      const { rows } = await app.db.query(
        `SELECT
           pi.id,
           pi.project_id,
           pi.email,
           pi.role,
           pi.token,
           pi.expires_at,
           pi.accepted_at,
           pi.created_at,
           pi.invited_by,
           jsonb_build_object('full_name', pr.full_name) as profiles
         FROM public.project_invites pi
         LEFT JOIN public.profiles pr ON pr.user_id = pi.invited_by
         WHERE pi.project_id = $1
           AND pi.accepted_at IS NULL
           AND pi.expires_at > now()
         ORDER BY pi.created_at DESC`,
        [projectId]
      );

      return reply.send({ invites: rows });
    }
  );

  // POST /functions/v1/project-invites  { projectId, email, role }
  app.post(
    '/functions/v1/project-invites',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const body = z
        .object({
          projectId: z.string().uuid(),
          email: z.string(),
          role: z.enum(['admin', 'tech_lead', 'developer', 'viewer', 'custom']).optional(),
          custom_role_name: z.string().nullable().optional(),
        })
        .parse(req.body);

      const email = body.email.trim();
      if (!inviteEmailRegex.test(email)) {
        return reply.code(400).send({ error: 'Invalid email format' });
      }

      const memberRole = await getProjectRole(body.projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });
      if (memberRole !== 'admin' && memberRole !== 'tech_lead') {
        return reply.code(403).send({ error: 'Only admins and tech leads can invite members' });
      }

      // Prevent duplicate active invites
      const existing = await app.db.query(
        `SELECT id
         FROM public.project_invites
         WHERE project_id = $1 AND email = $2
           AND accepted_at IS NULL
           AND expires_at > now()
         LIMIT 1`,
        [body.projectId, email]
      );
      if (existing.rows.length > 0) {
        return reply.code(400).send({ error: 'An active invite already exists for this email' });
      }

      // Validate custom role if role is 'custom'
      if (body.role === 'custom') {
        if (!body.custom_role_name) {
          return reply.code(400).send({ error: 'custom_role_name is required when role is custom' });
        }
        // Verify custom role exists in the project
        const customRoleCheck = await app.db.query(
          `SELECT 1 FROM public.custom_role_permissions 
           WHERE project_id = $1 AND role_name = $2`,
          [body.projectId, body.custom_role_name]
        );
        if (customRoleCheck.rows.length === 0) {
          return reply.code(400).send({ error: 'Custom role not found in this project' });
        }
      }

      const { rows } = await app.db.query(
        `INSERT INTO public.project_invites (project_id, email, role, custom_role_name, invited_by, token, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, now() + interval '7 days', now(), now())
         RETURNING *`,
        [
          body.projectId, 
          email, 
          body.role ?? 'developer', 
          body.role === 'custom' ? body.custom_role_name : null,
          userId, 
          crypto.randomUUID()
        ]
      );

      return reply.code(201).send({ invite: rows[0] });
    }
  );

  // DELETE /functions/v1/project-invites/:id
  app.delete(
    '/functions/v1/project-invites/:inviteId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      const inviteId = (req.params as any).inviteId as string;

      const inviteResult = await app.db.query<{ project_id: string; invited_by: string }>(
        'SELECT project_id, invited_by FROM public.project_invites WHERE id = $1',
        [inviteId]
      );
      if (inviteResult.rows.length === 0) return reply.code(404).send({ error: 'Invite not found' });

      const invite = inviteResult.rows[0];
      const memberRole = await getProjectRole(invite.project_id, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      const canDelete = invite.invited_by === userId || memberRole === 'admin' || memberRole === 'tech_lead';
      if (!canDelete) {
        return reply.code(403).send({ error: 'Only the invite creator or admins can delete invites' });
      }

      await app.db.query('DELETE FROM public.project_invites WHERE id = $1', [inviteId]);
      return reply.send({ message: 'Invite deleted successfully' });
    }
  );

  // POST /functions/v1/project-invites/accept/:token  (public; optional auth)
  app.post('/functions/v1/project-invites/accept/:token', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = (req.params as any).token as string;
    if (!token) return reply.code(400).send({ error: 'Token is required' });

    const inviteResult = await app.db.query<{
      id: string;
      project_id: string;
      email: string;
      role: 'admin' | 'tech_lead' | 'developer' | 'viewer' | 'custom';
      custom_role_name: string | null;
      expires_at: string;
      accepted_at: string | null;
    }>(
      `SELECT id, project_id, email, role::text as role, custom_role_name, expires_at, accepted_at
       FROM public.project_invites
       WHERE token = $1::uuid
       LIMIT 1`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Invalid or expired invite token' });
    }

    const invite = inviteResult.rows[0];
    if (invite.accepted_at) return reply.code(400).send({ error: 'Invite has already been accepted' });
    if (new Date(invite.expires_at) < new Date()) return reply.code(400).send({ error: 'Invite has expired' });

    // Try optional auth
    let authedUserId: string | null = null;
    let authedEmail: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = (await (req as any).jwtVerify()) as { userId: string };
        authedUserId = decoded.userId;
        const emailRes = await app.db.query<{ email: string | null }>(
          'SELECT email FROM auth.users WHERE id = $1',
          [authedUserId]
        );
        authedEmail = emailRes.rows[0]?.email ?? null;
      } catch {
        // ignore
      }
    }

    // Not logged in: return info for UI flow
    if (!authedUserId || !authedEmail) {
      return reply.send({
        invite: {
          project_id: invite.project_id,
          email: invite.email,
          role: invite.role,
          custom_role_name: invite.custom_role_name,
          expires_at: invite.expires_at,
          accepted_at: invite.accepted_at,
        },
        requiresAuth: true,
      });
    }

    // Logged in: email must match
    if (authedEmail.toLowerCase() !== invite.email.toLowerCase()) {
      return reply.code(403).send({ error: 'Email does not match the invite' });
    }

    const client = await app.db.connect();
    try {
      await client.query('BEGIN');

      const existingMember = await client.query(
        'SELECT id FROM public.project_members WHERE project_id = $1 AND user_id = $2',
        [invite.project_id, authedUserId]
      );

      // Mark invite accepted even if already member
      await client.query('UPDATE public.project_invites SET accepted_at = now(), updated_at = now() WHERE id = $1', [
        invite.id,
      ]);

      if (existingMember.rows.length === 0) {
        await client.query(
          `INSERT INTO public.project_members (project_id, user_id, role, custom_role_name, created_at)
           VALUES ($1, $2, $3, $4, now())`,
          [invite.project_id, authedUserId, invite.role, invite.custom_role_name || null]
        );
      }

      await client.query('COMMIT');

      return reply.send({
        message: existingMember.rows.length > 0 ? 'Already a member' : 'Invite accepted successfully',
        project_id: invite.project_id,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      app.log.error(err);
      return reply.code(500).send({ error: 'Failed to accept invite' });
    } finally {
      client.release();
    }
  });

  // --- GitHub OAuth (compat: /functions/v1/github-oauth/*) ---

  async function canConnectGit(userId: string, projectId: string) {
    const { rows } = await app.db.query<{ role: any }>(
      'SELECT role FROM public.project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    const role = (rows[0]?.role as string | undefined) ?? null;
    return role === 'admin' || role === 'tech_lead';
  }

  // GET /functions/v1/github-oauth/connection?projectId=xxx
  app.get(
    '/functions/v1/github-oauth/connection',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const projectId = (req.query as any)?.projectId as string | undefined;
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      // must be a member
      const member = await app.db.query('SELECT 1 FROM public.project_members WHERE project_id = $1 AND user_id = $2', [
        projectId,
        userId,
      ]);
      if (member.rows.length === 0) return reply.code(403).send({ error: 'Forbidden' });

      const { rows } = await app.db.query(
        `SELECT id, username, status::text as status, scopes, last_sync_at
         FROM public.provider_connections
         WHERE project_id = $1 AND provider = 'github'::public.git_provider
         LIMIT 1`,
        [projectId]
      );

      const connection = rows[0] || null;
      const connected = !!connection && connection.status === 'active';

      return reply.send({
        connected,
        username: connection?.username ?? null,
        status: connection?.status ?? null,
        scopes: connection?.scopes ?? [],
        lastSyncAt: connection?.last_sync_at ?? null,
      });
    }
  );

  // POST /functions/v1/github-oauth/start  { projectId }
  app.post(
    '/functions/v1/github-oauth/start',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { projectId } = z.object({ projectId: z.string().uuid() }).parse(req.body);

      if (!(await canConnectGit(userId, projectId))) {
        return reply.code(403).send({ error: 'Only admins and tech leads can connect GitHub' });
      }

      const { GITHUB_CLIENT_ID, GITHUB_REDIRECT_URI } = app.env;
      if (!GITHUB_CLIENT_ID || !GITHUB_REDIRECT_URI) {
        return reply.code(500).send({
          error: 'GitHub OAuth not configured',
          hint: 'Configure GITHUB_CLIENT_ID and GITHUB_REDIRECT_URI (e.g. http://localhost:8081/functions/v1/github-oauth/callback)',
        });
      }

      const state = crypto.randomUUID();
      await app.db.query(
        `INSERT INTO public.github_oauth_states (state, project_id, user_id, created_at, expires_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, now(), now() + interval '5 minutes')`,
        [state, projectId, userId]
      );

      const scopes = 'repo read:org';
      const authorizeUrl =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`;

      return reply.send({ authorizeUrl, state });
    }
  );

  // GET /functions/v1/github-oauth/callback?code=...&state=...
  // Called by GitHub directly (no auth)
  app.get('/functions/v1/github-oauth/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = z
      .object({ code: z.string().optional(), state: z.string().optional() })
      .parse(req.query);

    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI, FRONTEND_URL } = app.env;
    const frontendBase = FRONTEND_URL || 'http://localhost:8080';

    if (!code || !state) {
      return reply.redirect(
        302,
        `${frontendBase}/project/error?message=${encodeURIComponent('Missing code or state parameter')}`
      );
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_REDIRECT_URI) {
      return reply.redirect(
        302,
        `${frontendBase}/project/error?message=${encodeURIComponent('GitHub OAuth not configured')}`
      );
    }

    const stateRes = await app.db.query<{ project_id: string; user_id: string }>(
      `SELECT project_id, user_id
       FROM public.github_oauth_states
       WHERE state = $1::uuid AND expires_at > now()
       LIMIT 1`,
      [state]
    );
    const oauthState = stateRes.rows[0];
    if (!oauthState) {
      return reply.redirect(302, `${frontendBase}/project/error?message=${encodeURIComponent('Invalid or expired state')}`);
    }

    // Exchange code for access token
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      }),
    });

    if (!tokenResp.ok) {
      return reply.redirect(
        302,
        `${frontendBase}/project/error?message=${encodeURIComponent('Failed to exchange code for token')}`
      );
    }
    const tokenData: any = await tokenResp.json().catch(() => ({}));
    const accessToken = tokenData.access_token as string | undefined;
    const scopes = (tokenData.scope ? String(tokenData.scope).split(',') : []).map((s: string) => s.trim()).filter(Boolean);

    if (!accessToken) {
      return reply.redirect(302, `${frontendBase}/project/error?message=${encodeURIComponent('No access token received')}`);
    }

    // Get GitHub user info
    const ghUserResp = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (!ghUserResp.ok) {
      return reply.redirect(302, `${frontendBase}/project/error?message=${encodeURIComponent('Failed to fetch GitHub user')}`);
    }
    const ghUser: any = await ghUserResp.json().catch(() => ({}));
    const githubUserId = ghUser?.id != null ? String(ghUser.id) : null;
    const username = ghUser?.login ? String(ghUser.login) : null;
    if (!githubUserId || !username) {
      return reply.redirect(
        302,
        `${frontendBase}/project/error?message=${encodeURIComponent('Invalid GitHub user payload')}`
      );
    }

    // Store connection (token stored as plaintext for now)
    const access_token_encrypted = accessToken;

    const client = await app.db.connect();
    try {
      await client.query('BEGIN');

      // Upsert provider connection
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.provider_connections
         WHERE project_id = $1 AND provider = 'github'::public.git_provider
         LIMIT 1`,
        [oauthState.project_id]
      );

      let connectionId: string;
      if (existing.rows.length > 0) {
        connectionId = existing.rows[0].id;
        await client.query(
          `UPDATE public.provider_connections
           SET github_user_id = $1,
               username = $2,
               owner_type = 'user',
               owner_name = $2,
               access_token_encrypted = $3,
               scopes = $4::text[],
               status = 'active'::public.connection_status,
               updated_at = now()
           WHERE id = $5`,
          [githubUserId, username, access_token_encrypted, scopes, connectionId]
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO public.provider_connections
            (project_id, provider, owner_type, owner_name, installation_id, workspace_id, status, created_by, created_at, updated_at,
             github_user_id, username, access_token_encrypted, scopes, secrets_ref)
           VALUES
            ($1, 'github'::public.git_provider, 'user', $2, NULL, NULL, 'active'::public.connection_status, $3, now(), now(),
             $4, $2, $5, $6::text[], NULL)
           RETURNING id`,
          [oauthState.project_id, username, oauthState.user_id, githubUserId, access_token_encrypted, scopes]
        );
        connectionId = inserted.rows[0].id;
      }

      // Delete used state
      await client.query('DELETE FROM public.github_oauth_states WHERE state = $1::uuid', [state]);

      await client.query('COMMIT');

      // Redirect to repo selection step
      return reply.redirect(302, `${frontendBase}/project/${oauthState.project_id}/code/select-repos?connected=true`);
    } catch (err) {
      await client.query('ROLLBACK');
      app.log.error(err);
      return reply.redirect(302, `${frontendBase}/project/error?message=${encodeURIComponent('Failed to save connection')}`);
    } finally {
      client.release();
    }
  });

  // POST /functions/v1/github-oauth/connection/revoke { projectId }
  app.post(
    '/functions/v1/github-oauth/connection/revoke',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { projectId } = z.object({ projectId: z.string().uuid() }).parse(req.body);
      if (!(await canConnectGit(userId, projectId))) return reply.code(403).send({ error: 'Forbidden' });

      const connRes = await app.db.query<{ id: string; access_token_encrypted: string | null }>(
        `SELECT id, access_token_encrypted
         FROM public.provider_connections
         WHERE project_id = $1 AND provider = 'github'::public.git_provider
         LIMIT 1`,
        [projectId]
      );
      if (connRes.rows.length === 0) return reply.code(404).send({ error: 'Connection not found' });

      const connection = connRes.rows[0];

      // Best-effort token revoke on GitHub
      const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = app.env;
      if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && connection.access_token_encrypted) {
        try {
          const basic = Buffer.from(`${GITHUB_CLIENT_ID}:${GITHUB_CLIENT_SECRET}`).toString('base64');
          await fetch(`https://api.github.com/applications/${GITHUB_CLIENT_ID}/token`, {
            method: 'DELETE',
            headers: {
              Authorization: `Basic ${basic}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ access_token: connection.access_token_encrypted }),
          }).catch(() => null);
        } catch {
          // ignore
        }
      }

      await app.db.query(
        `UPDATE public.provider_connections
         SET status = 'revoked'::public.connection_status, updated_at = now()
         WHERE id = $1`,
        [connection.id]
      );

      // Unselect repos for this connection
      await app.db.query(`UPDATE public.repos SET selected = false WHERE connection_id = $1`, [connection.id]);

      return reply.send({ ok: true });
    }
  );

  // GET /functions/v1/github-pulls/reviews/inbox?projectId=xxx
  app.get(
    '/functions/v1/github-pulls/reviews/inbox',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.query as any)?.projectId as string;
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      // 1. Obter conexão do usuário para este projeto
      const connectionResult = await app.db.query<{ access_token_encrypted: string; username: string }>(
        `SELECT access_token_encrypted, username FROM public.provider_connections 
         WHERE project_id = $1 AND provider = 'github' AND status = 'active'
         LIMIT 1`,
        [projectId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.send({ prs: [], pendingCount: 0 });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;
      let githubUsername = connectionResult.rows[0].username;

      // 2. Buscar repositórios selecionados do projeto
      const reposResult = await app.db.query<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM public.repos WHERE project_id = $1 AND selected = true`,
        [projectId]
      );

      if (reposResult.rows.length === 0) {
        return reply.send({ prs: [], pendingCount: 0 });
      }

      const repoIdMap = new Map(reposResult.rows.map(r => [r.full_name, r.id]));

      try {
        // 3) Garantir o username do GitHub (login) via token (mais confiável do que depender do DB)
        if (!githubUsername) {
          const meResp = await fetch(`https://api.github.com/user`, {
            headers: {
              Authorization: `token ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Neurelix-Nexus',
            },
          });
          if (meResp.ok) {
            const me: any = await meResp.json();
            githubUsername = me?.login;
          }
        }

        if (!githubUsername) {
          return reply.send({ prs: [], pendingCount: 0 });
        }

        // 4) Listar PRs abertos por repo e filtrar os que pedem review explicitamente ao usuário
        const pending: any[] = [];

        for (const repo of reposResult.rows) {
          const pullsUrl = `https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=100`;
          const pullsResp = await fetch(pullsUrl, {
            headers: {
              Authorization: `token ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Neurelix-Nexus',
            },
          });

          if (!pullsResp.ok) {
            const errData = await pullsResp.json().catch(() => ({}));
            app.log.warn({ status: pullsResp.status, errData, repo: repo.full_name }, 'Failed to list pulls for review inbox');
            continue;
          }

          const pulls: any[] = await pullsResp.json();
          for (const pr of pulls) {
            const requested = Array.isArray(pr.requested_reviewers)
              ? pr.requested_reviewers.some((u: any) => u?.login === githubUsername)
              : false;

            if (!requested) continue;

            pending.push({
              id: pr.id?.toString?.() || String(pr.id),
              repo_id: repoIdMap.get(repo.full_name) || repo.full_name,
              repo: { fullName: repo.full_name },
              number: pr.number,
              title: pr.title,
              author_username: pr.user?.login,
              created_at: pr.created_at,
              updated_at: pr.updated_at,
              url: pr.html_url,
              state: 'OPEN',
              target_branch: pr.base?.ref || '',
              source_branch: pr.head?.ref || '',
              review_status: {
                approved: 0,
                changes_requested: 0,
                commented: 0,
              },
            });
          }
        }

        return reply.send({ prs: pending, pendingCount: pending.length });
      } catch (err) {
        app.log.error({ err }, 'Error in review inbox implementation');
        return reply.send({ prs: [], pendingCount: 0 });
      }
    }
  );

  // GET /functions/v1/git-repos?projectId=xxx - Listar repositórios selecionados
  app.get(
    '/functions/v1/git-repos',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.query as any)?.projectId as string | undefined;
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      // Verificar se usuário é membro do projeto
      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });

      // Verificar se há conexão GitHub ativa - se não houver, retornar array vazio
      const connectionResult = await app.db.query<{ id: string }>(
        `SELECT id FROM public.provider_connections 
         WHERE project_id = $1 AND provider = 'github' AND status = 'active'
         LIMIT 1`,
        [projectId]
      );

      // Se não houver conexão, retornar array vazio em vez de erro
      if (connectionResult.rows.length === 0) {
        return reply.send({ repos: [] });
      }

      // Buscar repositórios selecionados do projeto
      const { rows } = await app.db.query(
        `SELECT 
           r.id,
           r.connection_id,
           r.provider_repo_id,
           r.full_name,
           r.default_branch,
           r.visibility,
           r.description,
           r.url,
           r.last_synced_at,
           r.sync_status,
           r.selected,
           r.created_at,
           r.updated_at
         FROM public.repos r
         WHERE r.project_id = $1 AND r.selected = true
         ORDER BY r.full_name ASC`,
        [projectId]
      );

      return reply.send({ repos: rows });
    }
  );

  // GET /functions/v1/git-repos/:repoId/overview
  app.get(
    '/functions/v1/git-repos/:repoId/overview',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;

      // Buscar repositório e verificar acesso via projeto
      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // TODO: Implementar overview completo (branches, commits, etc)
      // Por enquanto retorna dados básicos
      const { rows } = await app.db.query(
        `SELECT * FROM public.repos WHERE id = $1`,
        [repoId]
      );

      return reply.send(rows[0] || {});
    }
  );

  // GET /functions/v1/github-repos/selected?projectId=xxx
  app.get(
    '/functions/v1/github-repos/selected',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.query as any)?.projectId as string | undefined;
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });

      // Verificar se há conexão GitHub ativa - se não houver, retornar array vazio
      const connectionResult = await app.db.query<{ id: string }>(
        `SELECT id FROM public.provider_connections 
         WHERE project_id = $1 AND provider = 'github' AND status = 'active'
         LIMIT 1`,
        [projectId]
      );

      // Se não houver conexão, retornar array vazio em vez de erro
      if (connectionResult.rows.length === 0) {
        return reply.send({ repos: [] });
      }

      const { rows } = await app.db.query(
        `SELECT 
           r.id,
           r.full_name,
           r.default_branch,
           r.visibility,
           r.description,
           r.url,
           r.selected,
           r.created_at
         FROM public.repos r
         WHERE r.project_id = $1 AND r.selected = true
         ORDER BY r.full_name ASC`,
        [projectId]
      );

      return reply.send({ repos: rows });
    }
  );

  // GET /functions/v1/github-repos/available?projectId=xxx
  app.get(
    '/functions/v1/github-repos/available',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const projectId = (req.query as any)?.projectId as string | undefined;
      if (!projectId) return reply.code(400).send({ error: 'projectId is required' });

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });

      // Verificar se há conexão GitHub ativa
      const connectionResult = await app.db.query<{ id: string; access_token_encrypted: string }>(
        `SELECT id, access_token_encrypted 
         FROM public.provider_connections 
         WHERE project_id = $1 AND provider = 'github' AND status = 'active'
         LIMIT 1`,
        [projectId]
      );

      // Se não houver conexão, retornar array vazio em vez de erro
      if (connectionResult.rows.length === 0) {
        return reply.send({ repos: [], orgs: [] });
      }

      const connection = connectionResult.rows[0];
      const accessToken = connection.access_token_encrypted; // TODO: Descriptografar se necessário

      if (!accessToken) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      // Buscar repositórios do GitHub via API
      const org = (req.query as any)?.org as string | undefined;
      const search = (req.query as any)?.search as string | undefined;
      
      let allRepos: any[] = [];
      let page = 1;
      const perPage = 100;
      let hasMore = true;

      // Buscar todos os repositórios do usuário (incluindo de organizações)
      while (hasMore && page <= 10) { // Limitar a 10 páginas (1000 repositórios)
        const url = org && org !== '__all__'
          ? `https://api.github.com/orgs/${org}/repos?per_page=${perPage}&page=${page}&sort=updated`
          : `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`;

        const response = await fetch(url, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Neurelix-Nexus',
          },
        }).then((r) => r.json()).catch(() => []);

        if (Array.isArray(response)) {
          allRepos = allRepos.concat(response);
          hasMore = response.length === perPage;
          page++;
        } else {
          hasMore = false;
        }
      }

      // Filtrar por busca se fornecido
      if (search) {
        const searchLower = search.toLowerCase();
        allRepos = allRepos.filter((repo: any) =>
          repo.full_name?.toLowerCase().includes(searchLower) ||
          repo.name?.toLowerCase().includes(searchLower) ||
          repo.description?.toLowerCase().includes(searchLower)
        );
      }

      // Buscar repositórios já selecionados no banco
      const selectedReposResult = await app.db.query<{ full_name: string }>(
        `SELECT full_name FROM public.repos 
         WHERE connection_id = $1 AND selected = true`,
        [connection.id]
      );
      const selectedFullNames = new Set(selectedReposResult.rows.map((r) => r.full_name));

      // Extrair organizações únicas
      const orgsSet = new Set<string>();
      allRepos.forEach((repo: any) => {
        const owner = repo.owner?.login || repo.full_name?.split('/')[0];
        if (owner && repo.owner?.type === 'Organization') {
          orgsSet.add(owner);
        }
      });

      // Mapear repositórios para o formato esperado
      const repos = allRepos.map((repo: any) => ({
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner?.login || repo.full_name?.split('/')[0] || '',
        private: repo.private === true,
        defaultBranch: repo.default_branch || 'main',
        description: repo.description || '',
        url: repo.html_url,
        updatedAt: repo.updated_at || repo.created_at,
        selected: selectedFullNames.has(repo.full_name),
      }));

      return reply.send({
        repos,
        orgs: Array.from(orgsSet).sort(),
      });
    }
  );

  // POST /functions/v1/github-repos/select
  app.post(
    '/functions/v1/github-repos/select',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { projectId, selectedFullNames } = z.object({
        projectId: z.string().uuid(),
        selectedFullNames: z.array(z.string()),
      }).parse(req.body);

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Project not found or access denied' });
      if (memberRole !== 'admin' && memberRole !== 'tech_lead') {
        return reply.code(403).send({ error: 'Only admins and tech leads can select repos' });
      }

      // Buscar conexão ativa
      const connectionResult = await app.db.query<{ id: string }>(
        `SELECT id FROM public.provider_connections 
         WHERE project_id = $1 AND provider = 'github' AND status = 'active'
         LIMIT 1`,
        [projectId]
      );

      if (connectionResult.rows.length === 0) {
        return reply.code(400).send({ error: 'No active GitHub connection found' });
      }

      const connectionId = connectionResult.rows[0].id;

      // Buscar informações da conexão para obter o access_token
      const connectionInfo = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );
      const accessToken = connectionInfo.rows[0]?.access_token_encrypted;

      if (!accessToken) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      // Buscar informações dos repositórios selecionados da API do GitHub
      const reposToCreate: Array<{
        full_name: string;
        provider_repo_id: string;
        default_branch: string;
        visibility: string;
        description: string | null;
        url: string;
      }> = [];

      // Buscar informações de cada repositório selecionado
      for (const fullName of selectedFullNames) {
        try {
          const [owner, repo] = fullName.split('/');
          const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: {
              Authorization: `token ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Neurelix-Nexus',
            },
          });

          if (response.ok) {
            const repoData: any = await response.json();
            reposToCreate.push({
              full_name: repoData.full_name,
              provider_repo_id: String(repoData.id),
              default_branch: repoData.default_branch || 'main',
              visibility: repoData.private ? 'private' : 'public',
              description: repoData.description || null,
              url: repoData.html_url,
            });
          }
        } catch (err) {
          app.log.warn({ err, fullName }, 'Failed to fetch repo info from GitHub');
        }
      }

      const client = await app.db.connect();
      try {
        await client.query('BEGIN');

        // Desmarcar todos os repositórios do projeto
        await client.query(
          `UPDATE public.repos SET selected = false WHERE project_id = $1`,
          [projectId]
        );

        // Criar ou atualizar repositórios selecionados
        const selectedRepos: Array<{ id: string; full_name: string }> = [];

        for (const repo of reposToCreate) {
          // Verificar se o repositório já existe
          const existing = await client.query<{ id: string }>(
            `SELECT id FROM public.repos 
             WHERE connection_id = $1 AND provider_repo_id = $2
             LIMIT 1`,
            [connectionId, repo.provider_repo_id]
          );

          if (existing.rows.length > 0) {
            // Atualizar repositório existente
            await client.query(
              `UPDATE public.repos 
               SET selected = true,
                   project_id = $1,
                   full_name = $2,
                   default_branch = $3,
                   visibility = $4,
                   description = $5,
                   url = $6,
                   updated_at = now()
               WHERE id = $7`,
              [
                projectId,
                repo.full_name,
                repo.default_branch,
                repo.visibility,
                repo.description,
                repo.url,
                existing.rows[0].id,
              ]
            );
            selectedRepos.push({ id: existing.rows[0].id, full_name: repo.full_name });
          } else {
            // Criar novo repositório
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO public.repos 
               (connection_id, provider_repo_id, full_name, default_branch, visibility, description, url, selected, project_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, now(), now())
               RETURNING id`,
              [
                connectionId,
                repo.provider_repo_id,
                repo.full_name,
                repo.default_branch,
                repo.visibility,
                repo.description,
                repo.url,
                projectId,
              ]
            );
            selectedRepos.push({ id: inserted.rows[0].id, full_name: repo.full_name });
          }
        }

        await client.query('COMMIT');

        return reply.send({ selected: selectedRepos });
      } catch (err) {
        await client.query('ROLLBACK');
        app.log.error(err);
        return reply.code(500).send({ error: 'Failed to select repos' });
      } finally {
        client.release();
      }
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/tree
  app.get(
    '/functions/v1/github-code/repos/:repoId/tree',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const ref = (req.query as any)?.ref as string || 'main';
      const path = (req.query as any)?.path as string || '';

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Buscar tree do GitHub
      try {
        const treePath = path ? `/${path}` : '';
        const treeUrl = `https://api.github.com/repos/${fullName}/contents${treePath}?ref=${ref}`;
        
        const response = await fetch(treeUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Neurelix-Nexus',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            return reply.send({ tree: [] });
          }
          return reply.code(response.status).send({ error: 'Failed to fetch tree from GitHub' });
        }

        const contents: any[] = await response.json();
        
        // Mapear para o formato esperado
        const tree = contents.map((item: any) => ({
          name: item.name,
          path: item.path,
          type: item.type, // 'file' ou 'dir'
          size: item.size || 0,
          sha: item.sha,
          url: item.html_url,
          download_url: item.download_url,
        }));

        return reply.send({ tree });
      } catch (err) {
        app.log.error({ err, repoId, path, ref }, 'Error fetching tree from GitHub');
        return reply.code(500).send({ error: 'Failed to fetch tree' });
      }
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/blob
  app.get(
    '/functions/v1/github-code/repos/:repoId/blob',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const ref = (req.query as any)?.ref as string || 'main';
      const path = (req.query as any)?.path as string;

      if (!path) return reply.code(400).send({ error: 'path is required' });

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Buscar conteúdo do arquivo do GitHub
      try {
        const blobUrl = `https://api.github.com/repos/${fullName}/contents/${path}?ref=${ref}`;
        
        const response = await fetch(blobUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Neurelix-Nexus',
          },
        });

        if (!response.ok) {
          return reply.code(response.status).send({ error: 'Failed to fetch file from GitHub' });
        }

        const fileData: any = await response.json();
        
        // Decodificar conteúdo base64
        let content = '';
        if (fileData.content) {
          content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        }

        return reply.send({
          name: fileData.name,
          path: fileData.path,
          sha: fileData.sha,
          size: fileData.size,
          encoding: fileData.encoding,
          content,
          download_url: fileData.download_url,
          html_url: fileData.html_url,
        });
      } catch (err) {
        app.log.error({ err, repoId, path, ref }, 'Error fetching blob from GitHub');
        return reply.code(500).send({ error: 'Failed to fetch file' });
      }
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/compare
  app.get(
    '/functions/v1/github-code/repos/:repoId/compare',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const { base, head } = z.object({
        base: z.string(),
        head: z.string(),
      }).parse(req.query);

      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );
      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      try {
        const compareUrl = `https://api.github.com/repos/${fullName}/compare/${base}...${head}`;
        const response = await fetch(compareUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Neurelix-Nexus',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return reply.code(response.status).send({ error: errorData.message || 'Failed to compare branches' });
        }

        const data: any = await response.json();
        return reply.send({
          status: data.status,
          ahead_by: data.ahead_by,
          behind_by: data.behind_by,
          total_commits: data.total_commits,
          commits: data.commits.map((c: any) => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author.name,
            date: c.commit.author.date,
          })),
          files: data.files.map((f: any) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
          })),
        });
      } catch (err) {
        app.log.error({ err, repoId }, 'Error comparing branches');
        return reply.code(500).send({ error: 'Failed to compare branches' });
      }
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/branches
  app.get(
    '/functions/v1/github-code/repos/:repoId/branches',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string; default_branch: string }>(
        `SELECT project_id, full_name, connection_id, default_branch FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;
      const defaultBranch = repoResult.rows[0].default_branch || 'main';

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Buscar branches do GitHub
      try {
        let allBranches: any[] = [];
        let page = 1;
        const perPage = 100;
        let hasMore = true;

        // Buscar todas as branches (com paginação)
        while (hasMore && page <= 10) {
          const branchesUrl = `https://api.github.com/repos/${fullName}/branches?per_page=${perPage}&page=${page}`;
          
          const response = await fetch(branchesUrl, {
            headers: {
              Authorization: `token ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'Neurelix-Nexus',
            },
          });

          if (!response.ok) {
            if (response.status === 404) {
              return reply.send({ branches: [] });
            }
            return reply.code(response.status).send({ error: 'Failed to fetch branches from GitHub' });
          }

          const branches: any[] = await response.json();
          allBranches = allBranches.concat(branches);
          hasMore = branches.length === perPage;
          page++;
        }

        // Mapear para o formato esperado
        const branches = allBranches.map((branch: any) => ({
          name: branch.name,
          sha: branch.commit?.sha,
          is_default: branch.name === defaultBranch,
          protected: branch.protected || false,
        }));

        return reply.send({ branches });
      } catch (err) {
        app.log.error({ err, repoId }, 'Error fetching branches from GitHub');
        return reply.code(500).send({ error: 'Failed to fetch branches' });
      }
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/commits
  app.get(
    '/functions/v1/github-code/repos/:repoId/commits',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const ref = (req.query as any)?.ref as string || 'main';
      const page = parseInt((req.query as any)?.page as string || '1', 10);
      const limit = parseInt((req.query as any)?.limit as string || '30', 10);

      // Verificar acesso ao repositório
      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar commits do banco
      const { rows } = await app.db.query(
        `SELECT 
           id,
           sha,
           branch_name,
           author_name,
           author_email,
           message,
           date,
           url,
           parent_shas
         FROM public.commits
         WHERE repo_id = $1 AND branch_name = $2
         ORDER BY date DESC
         LIMIT $3 OFFSET $4`,
        [repoId, ref, limit, (page - 1) * limit]
      );

      return reply.send({ commits: rows, page, limit });
    }
  );

  // GET /functions/v1/github-code/repos/:repoId/commits/:sha
  app.get(
    '/functions/v1/github-code/repos/:repoId/commits/:sha',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const sha = (req.params as any).sha as string;

      // Verificar acesso ao repositório
      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar commit do banco
      const { rows } = await app.db.query(
        `SELECT * FROM public.commits WHERE repo_id = $1 AND sha = $2 LIMIT 1`,
        [repoId, sha]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Commit not found' });
      }

      return reply.send(rows[0]);
    }
  );

  // GET /functions/v1/github-pulls/repos/:repoId/pulls
  app.get(
    '/functions/v1/github-pulls/repos/:repoId/pulls',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const state = (req.query as any)?.state as string || 'open';
      const page = parseInt((req.query as any)?.page as string || '1', 10);

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Buscar PRs do GitHub
      try {
        const prsUrl = `https://api.github.com/repos/${fullName}/pulls?state=${state}&page=${page}&per_page=30`;
        
        const response = await fetch(prsUrl, {
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Neurelix-Nexus',
          },
        });

        if (!response.ok) {
          return reply.code(response.status).send({ error: 'Failed to fetch PRs from GitHub' });
        }

        const prs: any[] = await response.json();
        
        // Mapear para o formato esperado
        const mappedPRs = prs.map((pr: any) => ({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          description: pr.body,
          state: pr.state.toUpperCase(),
          source_branch: pr.head.ref,
          target_branch: pr.base.ref,
          author_username: pr.user?.login,
          draft: pr.draft || false,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at,
          url: pr.html_url,
        }));

        return reply.send({ prs: mappedPRs, page });
      } catch (err) {
        app.log.error({ err, repoId }, 'Error fetching PRs from GitHub');
        return reply.code(500).send({ error: 'Failed to fetch PRs' });
      }
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const { title, description, head, base, draft } = z.object({
        title: z.string(),
        description: z.string().optional(),
        head: z.string(),
        base: z.string(),
        draft: z.boolean().optional(),
      }).parse(req.body);

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Criar PR no GitHub
      try {
        const createPRUrl = `https://api.github.com/repos/${fullName}/pulls`;
        
        const requestBody: any = {
          title,
          body: description || '',
          head,
          base,
        };

        // GitHub API só aceita 'draft' se for true, não enviar se for false
        if (draft === true) {
          requestBody.draft = true;
        }
        
        const response = await fetch(createPRUrl, {
          method: 'POST',
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Neurelix-Nexus',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.message || errorData.errors?.[0]?.message || 'Failed to create PR on GitHub';
          app.log.error({ 
            status: response.status, 
            error: errorData, 
            repoId, 
            fullName, 
            head, 
            base 
          }, 'GitHub API error creating PR');
          return reply.code(response.status).send({ 
            error: errorMessage,
            details: errorData.errors || undefined,
          });
        }

        const pr: any = await response.json();

        // Registrar PR no banco local do Neurelix com o usuário autenticado (dono do PR no Neurelix)
        // OBS: não depende do username do GitHub; GitHub pode ser o mesmo para múltiplos usuários Neurelix.
        try {
          await app.db.query(
            `INSERT INTO public.local_prs (project_id, repo_id, pr_number, author_username, owner_user_id)
             VALUES ($1::uuid, $2::uuid, $3::int, $4::text, $5::uuid)
             ON CONFLICT (repo_id, pr_number)
             DO UPDATE SET
               author_username = EXCLUDED.author_username,
               owner_user_id = EXCLUDED.owner_user_id,
               updated_at = now()`,
            [projectId, repoId, pr.number, pr.user?.login ? String(pr.user.login) : null, userId]
          );
        } catch {
          // ignore (tabela pode não existir até rodar migration)
        }

        return reply.send({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          description: pr.body,
          state: pr.state.toUpperCase(),
          source_branch: pr.head.ref,
          target_branch: pr.base.ref,
          author_username: pr.user?.login,
          draft: pr.draft || false,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          url: pr.html_url,
        });
      } catch (err) {
        app.log.error({ err, repoId, fullName, head, base }, 'Error creating PR on GitHub');
        return reply.code(500).send({ error: 'Failed to create PR' });
      }
    }
  );

  // GET /functions/v1/github-pulls/pulls/:repoId/:prNumber
  app.get(
    '/functions/v1/github-pulls/pulls/:repoId/:prNumber',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);

      // Verificar acesso ao repositório e obter informações
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );

      if (repoResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Repository not found' });
      }

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Buscar access_token da conexão
      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );

      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      // Buscar PR do GitHub + commits + arquivos + reviews + comentários
      try {
        const ghHeaders = {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Neurelix-Nexus',
        } as const;

        const prUrl = `https://api.github.com/repos/${fullName}/pulls/${prNumber}`;

        const prResp = await fetch(prUrl, {
          headers: {
            ...ghHeaders,
          },
        });

        if (!prResp.ok) {
          const errorData = await prResp.json().catch(() => ({}));
          return reply.code(prResp.status).send({ error: errorData.message || 'Failed to fetch PR from GitHub' });
        }

        const pr: any = await prResp.json();

        // Persistir PR no banco local (sem tentar inferir o dono pelo GitHub)
        // O dono do PR no Neurelix deve ser preenchido no momento da criação (POST create PR) ou manualmente no DB.
        try {
          await app.db.query(
            `INSERT INTO public.local_prs (project_id, repo_id, pr_number, author_username, owner_user_id)
             VALUES ($1::uuid, $2::uuid, $3::int, $4::text, NULL)
             ON CONFLICT (repo_id, pr_number)
             DO UPDATE SET
               author_username = EXCLUDED.author_username,
               updated_at = now()`,
            [projectId, repoId, prNumber, pr.user?.login ? String(pr.user.login) : null]
          );
        } catch {
          // ignore (tabela pode não existir até rodar migration)
        }

        // Buscar owner_user_id efetivo (se existir)
        let effectiveOwnerUserId: string | null = null;
        try {
          const ownerRow = await app.db.query<{ owner_user_id: string | null }>(
            `SELECT owner_user_id FROM public.local_prs WHERE repo_id = $1::uuid AND pr_number = $2::int`,
            [repoId, prNumber]
          );
          if (ownerRow.rows.length > 0) {
            effectiveOwnerUserId = ownerRow.rows[0].owner_user_id ?? null;
          }
        } catch {
          // ignore
        }

        // Commits
        const commitsResp = await fetch(
          `https://api.github.com/repos/${fullName}/pulls/${prNumber}/commits?per_page=100`,
          { headers: { ...ghHeaders } }
        );
        const commitsRaw: any[] = commitsResp.ok ? await commitsResp.json().catch(() => []) : [];
        const commits = Array.isArray(commitsRaw)
          ? commitsRaw.map((c: any) => ({
              sha: c.sha,
              message: (c.commit?.message || '').split('\n')[0] || c.sha,
              author: c.author?.login || c.commit?.author?.name || 'unknown',
              date: c.commit?.author?.date || c.commit?.committer?.date || new Date().toISOString(),
            }))
          : [];

        // Files (paginate up to 300 files)
        const files: any[] = [];
        for (let page = 1; page <= 3; page++) {
          const filesResp = await fetch(
            `https://api.github.com/repos/${fullName}/pulls/${prNumber}/files?per_page=100&page=${page}`,
            { headers: { ...ghHeaders } }
          );
          if (!filesResp.ok) break;
          const batch: any[] = await filesResp.json().catch(() => []);
          if (!Array.isArray(batch) || batch.length === 0) break;
          files.push(...batch);
          if (batch.length < 100) break;
        }
        const mappedFiles = files.map((f: any) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions || 0,
          deletions: f.deletions || 0,
          changes: f.changes || 0,
          patch: f.patch,
          raw_url: f.raw_url,
        }));

        // Reviews
        const reviewsResp = await fetch(`https://api.github.com/repos/${fullName}/pulls/${prNumber}/reviews?per_page=100`, {
          headers: { ...ghHeaders },
        });
        const reviewsRaw: any[] = reviewsResp.ok ? await reviewsResp.json().catch(() => []) : [];
        const reviews = Array.isArray(reviewsRaw)
          ? reviewsRaw.map((r: any) => ({
              id: String(r.id),
              reviewer: r.user?.login || 'unknown',
              state: r.state,
              body: r.body || '',
              submitted_at: r.submitted_at,
            }))
          : [];

        // Reviews locais (Neurelix) - não envolvem GitHub
        const localReviewsResult = await app.db.query<{
          id: string;
          reviewer_user_id: string;
          state: string;
          body: string | null;
          created_at: string;
          full_name: string | null;
          avatar_url: string | null;
        }>(
          `SELECT
             r.id,
             r.reviewer_user_id,
             r.state,
             r.body,
             r.created_at,
             p.full_name,
             p.avatar_url
           FROM public.local_pr_reviews r
           LEFT JOIN public.profiles p ON p.user_id = r.reviewer_user_id
           WHERE r.repo_id = $1::uuid AND r.pr_number = $2::int
           ORDER BY r.created_at DESC`,
          [repoId, prNumber]
        );
        const localReviews = localReviewsResult.rows.map((r) => ({
          id: `local:${r.id}`,
          reviewer: r.full_name || r.reviewer_user_id,
          reviewer_user_id: r.reviewer_user_id,
          state: r.state,
          body: r.body || '',
          submitted_at: r.created_at,
          scope: 'local',
        }));

        // General comments (issue comments)
        const issueCommentsResp = await fetch(
          `https://api.github.com/repos/${fullName}/issues/${prNumber}/comments?per_page=100`,
          { headers: { ...ghHeaders } }
        );
        const issueCommentsRaw: any[] = issueCommentsResp.ok ? await issueCommentsResp.json().catch(() => []) : [];
        const generalComments = Array.isArray(issueCommentsRaw)
          ? issueCommentsRaw.map((c: any) => ({
              id: String(c.id),
              author_username: c.user?.login || 'unknown',
              body: c.body || '',
              created_at: c.created_at,
            }))
          : [];

        // Comentários LOCAIS (Neurelix) - general + inline
        let localGeneralComments: any[] = [];
        let localInlineComments: any[] = [];
        try {
          const localRows = await app.db.query<{
            id: string;
            comment_type: string;
            thread_id: string;
            in_reply_to_id: string | null;
            path: string | null;
            line_number: number | null;
            side: string | null;
            body: string;
            author_user_id: string;
            created_at: string;
            full_name: string | null;
            avatar_url: string | null;
          }>(
            `SELECT
               c.id,
               c.comment_type,
               c.thread_id,
               c.in_reply_to_id,
               c.path,
               c.line_number,
               c.side,
               c.body,
               c.author_user_id,
               c.created_at,
               p.full_name,
               p.avatar_url
             FROM public.local_pr_comments c
             LEFT JOIN public.profiles p ON p.user_id = c.author_user_id
             WHERE c.repo_id = $1::uuid AND c.pr_number = $2::int
             ORDER BY c.created_at ASC`,
            [repoId, prNumber]
          );

          for (const row of localRows.rows) {
            const id = `local:${row.id}`;
            const authorName = row.full_name || row.author_user_id;
            if (row.comment_type === 'general') {
              localGeneralComments.push({
                id,
                author_username: authorName,
                body: row.body,
                created_at: row.created_at,
                scope: 'local',
              });
            } else if (row.comment_type === 'inline') {
              localInlineComments.push({
                id,
                author_username: authorName,
                body: row.body,
                path: row.path,
                line_number: row.line_number,
                line: row.line_number,
                side: row.side,
                in_reply_to_id: row.in_reply_to_id,
                created_at: row.created_at,
                thread_id: row.thread_id || (row.in_reply_to_id ? row.in_reply_to_id : id),
                scope: 'local',
              });
            }
          }
        } catch {
          // ignore (tabela pode não existir até rodar migration)
        }

        // Inline comments (review comments)
        const reviewComments: any[] = [];
        for (let page = 1; page <= 3; page++) {
          const rcResp = await fetch(
            `https://api.github.com/repos/${fullName}/pulls/${prNumber}/comments?per_page=100&page=${page}`,
            { headers: { ...ghHeaders } }
          );
          if (!rcResp.ok) break;
          const batch: any[] = await rcResp.json().catch(() => []);
          if (!Array.isArray(batch) || batch.length === 0) break;
          reviewComments.push(...batch);
          if (batch.length < 100) break;
        }
        const ghInlineComments = reviewComments.map((c: any) => {
          const lineNumber = c.line ?? c.original_line ?? null;
          return {
            id: String(c.id),
            author_username: c.user?.login || 'unknown',
            body: c.body || '',
            path: c.path,
            line_number: lineNumber,
            line: lineNumber, // compat com PRDetail.tsx
            side: c.side || c.original_position ? 'RIGHT' : undefined,
            in_reply_to_id: c.in_reply_to_id ? String(c.in_reply_to_id) : undefined,
            created_at: c.created_at,
          };
        });

        const inlineComments = [...ghInlineComments, ...localInlineComments];

        // Enriquecer comentários com status local (resolver/não corrigir) e reações locais
        let resolutionByThreadId = new Map<string, any>();
        let reactionsByCommentId = new Map<string, any[]>();
        try {
          const resRows = await app.db.query<{
            thread_id: string;
            resolution: string;
            reason: string;
            resolved_by_user_id: string;
            created_at: string;
            full_name: string | null;
          }>(
            `SELECT r.thread_id, r.resolution, r.reason, r.resolved_by_user_id, r.created_at, p.full_name
             FROM public.local_pr_thread_resolutions r
             LEFT JOIN public.profiles p ON p.user_id = r.resolved_by_user_id
             WHERE r.repo_id = $1::uuid AND r.pr_number = $2::int`,
            [repoId, prNumber]
          );
          resolutionByThreadId = new Map(
            resRows.rows.map((r) => [
              String(r.thread_id),
              {
                resolution: r.resolution,
                reason: r.reason,
                resolved_by_user_id: r.resolved_by_user_id,
                resolved_by_name: r.full_name,
                created_at: r.created_at,
              },
            ])
          );
        } catch {
          // ignore (tabela pode não existir até rodar migration)
        }

        try {
          const rxRows = await app.db.query<{
            comment_id: string;
            user_id: string;
            reaction: string;
            reason: string | null;
            created_at: string;
            full_name: string | null;
          }>(
            `SELECT r.comment_id, r.user_id, r.reaction, r.reason, r.created_at, p.full_name
             FROM public.local_pr_comment_reactions r
             LEFT JOIN public.profiles p ON p.user_id = r.user_id
             WHERE r.repo_id = $1::uuid AND r.pr_number = $2::int`,
            [repoId, prNumber]
          );
          reactionsByCommentId = new Map();
          for (const row of rxRows.rows) {
            const id = String(row.comment_id);
            if (!reactionsByCommentId.has(id)) reactionsByCommentId.set(id, []);
            reactionsByCommentId.get(id)!.push(row);
          }
        } catch {
          // ignore
        }

        const enrichedInlineComments = inlineComments.map((c: any) => {
          const threadId = c.thread_id ? String(c.thread_id) : (c.in_reply_to_id ? String(c.in_reply_to_id) : String(c.id));
          const threadResolution = resolutionByThreadId.get(threadId);

          const rx = reactionsByCommentId.get(String(c.id)) || [];
          const counts = { like: 0, dislike: 0, contra: 0 };
          for (const r of rx) {
            if (r.reaction === 'like') counts.like++;
            if (r.reaction === 'dislike') counts.dislike++;
            if (r.reaction === 'contra') counts.contra++;
          }
          const myRow = rx.find((r) => r.user_id === userId);
          const contraReasons = rx
            .filter((r) => r.reaction === 'contra' && r.reason)
            .map((r) => ({
              user_id: r.user_id,
              user_name: r.full_name,
              reason: r.reason,
              created_at: r.created_at,
            }));

          return {
            ...c,
            thread_id: threadId,
            thread_resolution: threadResolution || null,
            local_reactions: {
              counts,
              my: myRow?.reaction || null,
              contra_reasons: contraReasons,
            },
          };
        });

        // Buscar tarefas vinculadas (se houver)
        const linkedTarefas: any[] = []; // TODO: Implementar busca de tarefas vinculadas

        return reply.send({
          pr: {
            id: pr.id,
            number: pr.number,
            title: pr.title,
            description: pr.body,
            state: pr.merged_at ? 'MERGED' : String(pr.state || '').toUpperCase(),
            source_branch: pr.head.ref,
            target_branch: pr.base.ref,
            author_username: pr.user?.login,
            draft: pr.draft || false,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            merged_at: pr.merged_at,
            owner_user_id: effectiveOwnerUserId,
            url: pr.html_url,
            commits,
            files: mappedFiles,
            reviews: [...localReviews, ...reviews],
            comments: {
              general: [...localGeneralComments, ...generalComments],
              inline: enrichedInlineComments,
            },
          },
          linked_tarefas: linkedTarefas,
        });
      } catch (err) {
        app.log.error({ err, repoId, prNumber }, 'Error fetching PR from GitHub');
        return reply.code(500).send({ error: 'Failed to fetch PR' });
      }
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/reviews
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/reviews',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const { state, body, event } = z.object({
        state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
        body: z.string().optional(),
        event: z.string().optional(),
      }).parse(req.body);

      // Verificar acesso e obter token
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // REVIEW LOCAL (sem GitHub): gravar no banco usando o usuário autenticado do Neurelix
      try {
        const upsert = await app.db.query<{
          id: string;
          project_id: string;
          repo_id: string;
          pr_number: number;
          reviewer_user_id: string;
          state: string;
          body: string | null;
          created_at: string;
        }>(
          `INSERT INTO public.local_pr_reviews (project_id, repo_id, pr_number, reviewer_user_id, state, body)
           VALUES ($1::uuid, $2::uuid, $3::int, $4::uuid, $5::text, $6::text)
           ON CONFLICT (repo_id, pr_number, reviewer_user_id)
           DO UPDATE SET state = EXCLUDED.state, body = EXCLUDED.body, created_at = now()
           RETURNING id, project_id, repo_id, pr_number, reviewer_user_id, state, body, created_at`,
          [projectId, repoId, prNumber, userId, state, body ?? null]
        );

        return reply.send({
          review: {
            id: upsert.rows[0].id,
            reviewer_user_id: upsert.rows[0].reviewer_user_id,
            state: upsert.rows[0].state,
            body: upsert.rows[0].body,
            created_at: upsert.rows[0].created_at,
            scope: 'local',
          },
        });
      } catch (err) {
        app.log.error({ err, repoId, prNumber, userId }, 'Error submitting LOCAL review');
        return reply.code(500).send({ error: 'Failed to submit local review' });
      }
    }
  );

  // DELETE /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/reviews
  // Remove o review LOCAL do usuário autenticado (não envolve GitHub)
  app.delete(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/reviews',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);

      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;
      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      await app.db.query(
        `DELETE FROM public.local_pr_reviews
         WHERE repo_id = $1::uuid AND pr_number = $2::int AND reviewer_user_id = $3::uuid`,
        [repoId, prNumber, userId]
      );

      return reply.send({ ok: true });
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/merge
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/merge',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const { merge_method, commit_title, commit_message } = z.object({
        merge_method: z.enum(['MERGE', 'SQUASH', 'REBASE']).optional(),
        commit_title: z.string().optional(),
        commit_message: z.string().optional(),
      }).parse(req.body);

      // Verificar acesso e obter token
      const repoResult = await app.db.query<{ project_id: string; full_name: string; connection_id: string }>(
        `SELECT project_id, full_name, connection_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;
      const fullName = repoResult.rows[0].full_name;
      const connectionId = repoResult.rows[0].connection_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });
      if (memberRole !== 'admin' && memberRole !== 'tech_lead') {
        return reply.code(403).send({ error: 'Only admins and tech leads can merge PRs' });
      }

      const connectionResult = await app.db.query<{ access_token_encrypted: string }>(
        `SELECT access_token_encrypted FROM public.provider_connections WHERE id = $1`,
        [connectionId]
      );
      if (connectionResult.rows.length === 0 || !connectionResult.rows[0].access_token_encrypted) {
        return reply.code(400).send({ error: 'No access token available' });
      }

      const accessToken = connectionResult.rows[0].access_token_encrypted;

      try {
        const mergeUrl = `https://api.github.com/repos/${fullName}/pulls/${prNumber}/merge`;
        const ghMergeMethod = merge_method?.toLowerCase() || 'merge';
        
        const response = await fetch(mergeUrl, {
          method: 'PUT',
          headers: {
            Authorization: `token ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Neurelix-Nexus',
          },
          body: JSON.stringify({
            merge_method: ghMergeMethod,
            commit_title: commit_title,
            commit_message: commit_message,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return reply.code(response.status).send({ error: errorData.message || 'Failed to merge PR' });
        }

        const result = await response.json();
        return reply.send({ merged: result.merged || false, message: result.message });
      } catch (err) {
        app.log.error({ err, repoId, prNumber }, 'Error merging PR');
        return reply.code(500).send({ error: 'Failed to merge PR' });
      }
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/comments
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/comments',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const { body } = z.object({ body: z.string().min(1) }).parse(req.body);

      // Verificar acesso ao repo/projeto
      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      try {
        // Comentário GERAL local (Neurelix) - não envolve GitHub
        const insert = await app.db.query<{
          id: string;
          created_at: string;
          full_name: string | null;
        }>(
          `WITH c AS (
             INSERT INTO public.local_pr_comments
               (project_id, repo_id, pr_number, comment_type, thread_id, body, author_user_id)
             VALUES
               ($1::uuid, $2::uuid, $3::int, 'general', 'temp', $4::text, $5::uuid)
             RETURNING id, created_at
           )
           SELECT c.id, c.created_at, p.full_name
           FROM c
           LEFT JOIN public.profiles p ON p.user_id = $5::uuid`,
          [projectId, repoId, prNumber, body, userId]
        );

        const localId = String(insert.rows[0].id);
        const threadId = `local:${localId}`;
        await app.db.query(
          `UPDATE public.local_pr_comments SET thread_id = $1::text WHERE id = $2::uuid`,
          [threadId, localId]
        );

        return reply.send({
          comment: {
            id: threadId,
            author_username: insert.rows[0].full_name || userId,
            body,
            created_at: insert.rows[0].created_at,
            scope: 'local',
          },
        });
      } catch (err) {
        app.log.error({ err, repoId, prNumber }, 'Error creating comment');
        return reply.code(500).send({ error: 'Failed to create comment' });
      }
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/inline-comments
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/inline-comments',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const parsed = z
        .object({
          body: z.string().min(1),
          in_reply_to_id: z.string().optional(),
          path: z.string().optional(),
          line: z.number().optional(),
          side: z.enum(['LEFT', 'RIGHT']).optional(),
        })
        .parse(req.body);
      const body = parsed.body;
      const in_reply_to_id = parsed.in_reply_to_id;
      const path = parsed.path;
      const line = parsed.line;
      const side = parsed.side;

      // Verificar acesso ao repo/projeto
      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      try {
        // Comentário INLINE local (Neurelix) - não envolve GitHub
        if (!in_reply_to_id) {
          if (!path || !line || !side) {
            return reply.code(422).send({ error: 'path, line and side are required for a new inline thread' });
          }
        }

        const insert = await app.db.query<{
          id: string;
          created_at: string;
          full_name: string | null;
        }>(
          `WITH c AS (
             INSERT INTO public.local_pr_comments
               (project_id, repo_id, pr_number, comment_type, thread_id, in_reply_to_id, path, line_number, side, body, author_user_id)
             VALUES
               ($1::uuid, $2::uuid, $3::int, 'inline', $4::text, $5::text, $6::text, $7::int, $8::text, $9::text, $10::uuid)
             RETURNING id, created_at
           )
           SELECT c.id, c.created_at, p.full_name
           FROM c
           LEFT JOIN public.profiles p ON p.user_id = $10::uuid`,
          [
            projectId,
            repoId,
            prNumber,
            in_reply_to_id ? String(in_reply_to_id) : 'temp',
            in_reply_to_id ? String(in_reply_to_id) : null,
            path || null,
            (line as any) ?? null,
            side || null,
            body,
            userId,
          ]
        );

        const localId = String(insert.rows[0].id);
        const localCommentId = `local:${localId}`;
        if (!in_reply_to_id) {
          await app.db.query(
            `UPDATE public.local_pr_comments SET thread_id = $1::text WHERE id = $2::uuid`,
            [localCommentId, localId]
          );
        }

        return reply.send({
          comment: {
            id: localCommentId,
            author_username: insert.rows[0].full_name || userId,
            body,
            path: path || null,
            line_number: line || null,
            side: side || null,
            in_reply_to_id: in_reply_to_id || null,
            created_at: insert.rows[0].created_at,
            scope: 'local',
          },
        });
      } catch (err) {
        app.log.error({ err, repoId, prNumber }, 'Error creating inline comment');
        return reply.code(500).send({ error: 'Failed to create inline comment' });
      }
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/threads/:threadId/resolve
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/threads/:threadId/resolve',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const threadId = (req.params as any).threadId as string;
      const { resolution, reason } = z
        .object({
          resolution: z.enum(['RESOLVED', 'WONT_FIX']),
          reason: z.string().min(1),
        })
        .parse(req.body);

      const repoResult = await app.db.query<{ project_id: string }>(`SELECT project_id FROM public.repos WHERE id = $1`, [repoId]);
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });
      const projectId = repoResult.rows[0].project_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      // Apenas o dono do PR no Neurelix pode resolver/não corrigir
      try {
        const ownerRow = await app.db.query<{ owner_user_id: string | null }>(
          `SELECT owner_user_id FROM public.local_prs WHERE repo_id = $1::uuid AND pr_number = $2::int`,
          [repoId, prNumber]
        );
        const ownerUserId = ownerRow.rows[0]?.owner_user_id ?? null;
        if (!ownerUserId || ownerUserId !== userId) {
          return reply.code(403).send({ error: 'Only the PR owner can resolve threads' });
        }
      } catch {
        return reply.code(409).send({ error: 'PR owner unknown (run migrations and load PR once)' });
      }

      await app.db.query(
        `INSERT INTO public.local_pr_thread_resolutions (project_id, repo_id, pr_number, thread_id, resolution, reason, resolved_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::int, $4::text, $5::text, $6::text, $7::uuid)
         ON CONFLICT (repo_id, pr_number, thread_id)
         DO UPDATE SET resolution = EXCLUDED.resolution, reason = EXCLUDED.reason, resolved_by_user_id = EXCLUDED.resolved_by_user_id, created_at = now()`,
        [projectId, repoId, prNumber, threadId, resolution, reason, userId]
      );

      return reply.send({ ok: true });
    }
  );

  // POST /functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/comments/:commentId/reactions
  app.post(
    '/functions/v1/github-pulls/repos/:repoId/pulls/:prNumber/comments/:commentId/reactions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const repoId = (req.params as any).repoId as string;
      const prNumber = parseInt((req.params as any).prNumber as string, 10);
      const commentId = (req.params as any).commentId as string;
      const { reaction, reason } = z
        .object({ reaction: z.enum(['like', 'dislike', 'contra']), reason: z.string().optional() })
        .parse(req.body);

      const repoResult = await app.db.query<{ project_id: string }>(
        `SELECT project_id FROM public.repos WHERE id = $1`,
        [repoId]
      );
      if (repoResult.rows.length === 0) return reply.code(404).send({ error: 'Repository not found' });

      const projectId = repoResult.rows[0].project_id;

      const memberRole = await getProjectRole(projectId, userId);
      if (!memberRole) return reply.code(403).send({ error: 'Access denied' });

      if (reaction === 'contra' && !reason?.trim()) {
        return reply.code(422).send({ error: 'Reason is required for contra' });
      }

      // Toggle: se já existe a mesma reação do usuário, remove. Senão, upsert.
      const existing = await app.db.query<{ reaction: string }>(
        `SELECT reaction FROM public.local_pr_comment_reactions
         WHERE repo_id = $1::uuid AND pr_number = $2::int AND comment_id = $3::text AND user_id = $4::uuid`,
        [repoId, prNumber, commentId, userId]
      );

      if (existing.rows.length > 0 && existing.rows[0].reaction === reaction) {
        await app.db.query(
          `DELETE FROM public.local_pr_comment_reactions
           WHERE repo_id = $1::uuid AND pr_number = $2::int AND comment_id = $3::text AND user_id = $4::uuid`,
          [repoId, prNumber, commentId, userId]
        );
        return reply.send({ ok: true, toggled: 'off' });
      }

      await app.db.query(
        `INSERT INTO public.local_pr_comment_reactions (project_id, repo_id, pr_number, comment_id, user_id, reaction, reason)
         VALUES ($1::uuid, $2::uuid, $3::int, $4::text, $5::uuid, $6::text, $7::text)
         ON CONFLICT (repo_id, pr_number, comment_id, user_id)
         DO UPDATE SET reaction = EXCLUDED.reaction, reason = EXCLUDED.reason, created_at = now()`,
        [projectId, repoId, prNumber, commentId, userId, reaction, reason?.trim() || null]
      );

      return reply.send({ ok: true, toggled: 'on' });
    }
  );

  // GET /functions/v1/bear-assistant/sessions?whiteboardId=xxx
  app.get(
    '/functions/v1/bear-assistant/sessions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.query as any)?.whiteboardId as string | undefined;
      if (!whiteboardId) {
        return reply.send({ sessions: [] });
      }

      const hasAccess = await ensureWhiteboardAccess(whiteboardId, userId);
      if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

      const { rows } = await app.db.query(
        `SELECT id, title, created_at, updated_at
         FROM public.assistant_sessions
         WHERE user_id = $1 AND whiteboard_id = $2
         ORDER BY updated_at DESC, created_at DESC`,
        [userId, whiteboardId]
      );

      return reply.send({ sessions: rows });
    }
  );

  // POST /functions/v1/bear-assistant/sessions
  app.post(
    '/functions/v1/bear-assistant/sessions',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const { whiteboardId, title } = z.object({
        whiteboardId: z.string().uuid(),
        title: z.string().optional(),
      }).parse(req.body);

      const hasAccess = await ensureWhiteboardAccess(whiteboardId, userId);
      if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

      let finalTitle = title?.trim();
      if (!finalTitle) {
        const { rows } = await app.db.query<{ count: string }>(
          `SELECT COUNT(*)::text as count
           FROM public.assistant_sessions
           WHERE user_id = $1 AND whiteboard_id = $2`,
          [userId, whiteboardId]
        );
        const count = Number(rows[0]?.count ?? 0);
        finalTitle = `Sessão ${count + 1}`;
      }

      const { rows } = await app.db.query(
        `INSERT INTO public.assistant_sessions (user_id, whiteboard_id, title)
         VALUES ($1, $2, $3)
         RETURNING id, title, created_at, updated_at`,
        [userId, whiteboardId, finalTitle]
      );

      return reply.send({ session: rows[0] });
    }
  );

  // PATCH /functions/v1/bear-assistant/sessions/:sessionId
  app.patch(
    '/functions/v1/bear-assistant/sessions/:sessionId',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const sessionId = (req.params as any).sessionId as string;
      const { title } = z.object({
        title: z.string().min(1),
      }).parse(req.body);

      const sessionResult = await app.db.query<{ whiteboard_id: string }>(
        `SELECT whiteboard_id FROM public.assistant_sessions
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [sessionId, userId]
      );

      if (!sessionResult.rows.length) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const hasAccess = await ensureWhiteboardAccess(sessionResult.rows[0].whiteboard_id, userId);
      if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

      const { rows } = await app.db.query(
        `UPDATE public.assistant_sessions
         SET title = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, title, created_at, updated_at`,
        [title, sessionId]
      );

      return reply.send({ session: rows[0] });
    }
  );

  // GET /functions/v1/bear-assistant/history?whiteboardId=xxx
  app.get(
    '/functions/v1/bear-assistant/history',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = (req.user as any)?.userId as string;
      if (!userId) return reply.code(401).send({ error: 'Unauthorized' });

      const whiteboardId = (req.query as any)?.whiteboardId as string | undefined;
      if (!whiteboardId) {
        return reply.send({ messages: [] });
      }

      const hasAccess = await ensureWhiteboardAccess(whiteboardId, userId);
      if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

      const sessionId = (req.query as any)?.sessionId as string | undefined;
      const limitRaw = Number((req.query as any)?.limit ?? 200);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

      let effectiveSessionId = sessionId;
      if (!effectiveSessionId) {
        const { rows: sessionRows } = await app.db.query<{ id: string }>(
          `SELECT id FROM public.assistant_sessions
           WHERE user_id = $1 AND whiteboard_id = $2
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1`,
          [userId, whiteboardId]
        );
        effectiveSessionId = sessionRows[0]?.id;
      } else {
        const { rows: sessionRows } = await app.db.query<{ id: string }>(
          `SELECT id FROM public.assistant_sessions
           WHERE id = $1 AND user_id = $2 AND whiteboard_id = $3
           LIMIT 1`,
          [effectiveSessionId, userId, whiteboardId]
        );
        if (!sessionRows.length) return reply.code(403).send({ error: 'Access denied' });
      }

      if (!effectiveSessionId) {
        return reply.send({ messages: [] });
      }

      const { rows } = await app.db.query(
        `SELECT role, content, created_at
         FROM public.assistant_messages
         WHERE user_id = $1 AND session_id = $2
         ORDER BY created_at ASC, id ASC
         LIMIT $3`,
        [userId, effectiveSessionId, limit]
      );

      return reply.send({ messages: rows });
    }
  );

  // POST /functions/v1/bear-assistant
  app.post(
    '/functions/v1/bear-assistant',
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { messages, action, whiteboardId, sessionId, projectId } = z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'assistant', 'system']),
          content: z.string(),
        })),
        action: z.string().optional(),
        whiteboardId: z.string().uuid().optional(),
        sessionId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
      }).parse(req.body);

      const GEMINI_API_KEY = app.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return reply.code(500).send({ error: 'GEMINI_API_KEY não configurada' });
      }

      let systemInstructions = SYSTEM_PROMPT;

      const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
      const isFlowRequest =
        action === "suggest_flow" ||
        (action !== "analyze_selection" &&
          action !== "create_tasks" &&
          (lastUserMessage.includes("fluxo") ||
            lastUserMessage.includes("processo") ||
            lastUserMessage.includes("diagrama") ||
            lastUserMessage.includes("mapa")));

      if (action === "generate_ideas") {
        systemInstructions += "\n\nO usuário quer gerar ideias. Forneça uma lista de 5-7 ideias criativas e acionáveis.";
      } else if (action === "summarize") {
        systemInstructions += "\n\nO usuário quer um resumo. Seja conciso e destaque os pontos principais.";
      } else if (action === "create_elements") {
        systemInstructions += "\n\nO usuário quer criar elementos visuais. Responda APENAS com JSON estruturado no formato especificado.";
      } else if (action === "autocomplete") {
        systemInstructions += "\n\nO usuário está digitando. Complete a frase ou parágrafo de forma natural e curta. Responda APENAS com o texto de completamento, sem explicações.";
      } else if (action === "analyze_selection") {
        systemInstructions += "\n\nO usuário enviou elementos selecionados do quadro em JSON. Responda com um resumo do que foi desenhado, contexto e possíveis insights. Não gere novos elementos e não responda com JSON.";
      } else if (action === "create_tasks") {
        systemInstructions += `

O usuário quer criar tarefas e/ou um board novo.
Responda APENAS com JSON no formato:
{
  "type": "task_plan",
  "board": {
    "mode": "existing" | "new",
    "id": "board_id_se_existente",
    "name": "Nome do board (se novo)",
    "type": "KANBAN" | "SCRUM",
    "columns": ["To Do", "In Progress", "Done"]
  },
  "tasks": [
    {
      "title": "Título curto",
      "description": "Descrição opcional",
      "type": "TASK",
      "priority": "MEDIUM",
      "column": "To Do"
    }
  ]
}

Regras:
- Se escolher um board existente, use o id fornecido na lista de boards.
- Se não houver board adequado, crie um novo (mode: "new") e defina colunas.
- Não atribua responsável, prazo ou horas estimadas.
- Gere no máximo ${MAX_TASKS_PER_PLAN} tarefas.
`;
      }

      if (isFlowRequest) {
        systemInstructions += `
\n\nO usuário quer um FLUXOGRAMA ou PROCESSO.
NÃO responda com listas ou markdown.
Responda APENAS com um JSON do tipo "graph".
Crie um fluxo lógico com início, meio e fim.
Use "diamond" para decisões (ex: "Aprovado?", "Tem orçamento?").
Use "rectangle" para ações (ex: "Enviar email", "Comprar item").
Use "postit" para notas ou observações laterais.
Toda decisão deve ter duas saídas com label "Sim" e "Não" apontando para ações diferentes.

Exemplo de Fluxo de Compra:
{
  "type": "graph",
  "nodes": [
    { "id": "start", "type": "rectangle", "text": "Início: Solicitação", "color": "blue" },
    { "id": "check", "type": "diamond", "text": "Valor < 1000?", "color": "white" },
    { "id": "auto", "type": "rectangle", "text": "Aprovação Automática", "color": "green" },
    { "id": "manager", "type": "rectangle", "text": "Aprovação Gestor", "color": "blue" },
    { "id": "end", "type": "rectangle", "text": "Compra Realizada", "color": "blue" }
  ],
  "edges": [
    { "from": "start", "to": "check" },
    { "from": "check", "to": "auto", "label": "Sim" },
    { "from": "check", "to": "manager", "label": "Não" },
    { "from": "auto", "to": "end" },
    { "from": "manager", "to": "end" }
  ]
}
`;
      }

      const userId = (req.user as any)?.userId as string | undefined;

      if (action === 'create_tasks') {
        if (!projectId) {
          return reply.code(400).send({ error: 'projectId is required for create_tasks' });
        }

        if (!userId) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        const hasProjectAccess = await ensureProjectAccess(projectId, userId);
        if (!hasProjectAccess) return reply.code(403).send({ error: 'Access denied' });

        const boardsResult = await app.db.query(
          `SELECT b.id, b.name, b.type
           FROM boards b
           INNER JOIN project_members pm ON pm.project_id = b.project_id
           WHERE b.project_id = $1 AND pm.user_id = $2
           ORDER BY b.created_at DESC
           LIMIT 10`,
          [projectId, userId]
        );

        const boards = boardsResult.rows;
        const boardIds = boards.map((b: any) => b.id);

        const workflowsByBoard = new Map<string, string>();
        const workflowBoardMap = new Map<string, string>();
        const statusesByBoard = new Map<string, { name: string; position: number }[]>();

        if (boardIds.length > 0) {
          const workflowRows = await app.db.query(
            `SELECT id, board_id FROM workflows WHERE is_default = true AND board_id = ANY($1::uuid[])`,
            [boardIds]
          );

          workflowRows.rows.forEach((row: any) => {
            workflowsByBoard.set(row.board_id, row.id);
            workflowBoardMap.set(row.id, row.board_id);
          });

          const workflowIds = Array.from(workflowsByBoard.values());
          if (workflowIds.length > 0) {
            const statusRows = await app.db.query(
              `SELECT workflow_id, name, position
               FROM workflow_statuses
               WHERE workflow_id = ANY($1::uuid[])
               ORDER BY position ASC`,
              [workflowIds]
            );

            statusRows.rows.forEach((row: any) => {
              const boardId = workflowBoardMap.get(row.workflow_id);
              if (!boardId) return;
              const list = statusesByBoard.get(boardId) ?? [];
              list.push({ name: row.name, position: row.position });
              statusesByBoard.set(boardId, list);
            });
          }
        }

        const boardContext = boards.map((board: any) => ({
          id: board.id,
          name: board.name,
          type: board.type,
          columns: (statusesByBoard.get(board.id) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((s) => s.name),
        }));

        systemInstructions += `\n\nBoards disponíveis (use o id para escolher um existente):\n${JSON.stringify(boardContext, null, 2)}`;
      }

      // Construir texto final combinando system prompt e mensagens
      let finalText = systemInstructions;
      for (const msg of messages) {
        if (msg.role === "user") {
          finalText += `\n\nUsuário: ${msg.content}`;
        } else if (msg.role === "assistant") {
          finalText += `\n\nAssistente: ${msg.content}`;
        }
      }

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: finalText
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        }
      };

      const callGemini = async (model: string) => {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

        try {
          const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY,
            },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const status = response.status;
            let errorMessage = "Erro no serviço de IA";

            try {
              const errorData = await response.json();
              errorMessage = errorData.error?.message || `Erro ${status}`;
            } catch {
              const errorText = await response.text();
              errorMessage = errorText || `Erro ${status}`;
            }

            return { ok: false as const, status, error: errorMessage };
          }

          const data = await response.json();

          if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            return { ok: false as const, status: 500, error: "Resposta inválida da API do Gemini" };
          }

          const generatedText = data.candidates[0].content.parts[0]?.text || "";

          if (!generatedText) {
            return { ok: false as const, status: 500, error: "Resposta vazia da API do Gemini" };
          }

          return {
            ok: true as const,
            text: generatedText,
            finishReason: data.candidates[0].finishReason || "stop",
          };
        } catch (error) {
          return {
            ok: false as const,
            status: 500,
            error: error instanceof Error ? error.message : "Erro desconhecido",
          };
        }
      };

      try {
        const primaryResult = await callGemini('gemini-2.5-flash');
        let result = primaryResult;

        if (!primaryResult.ok) {
          const fallbackResult = await callGemini('gemini-2.5-flash-lite');
          if (!fallbackResult.ok) {
            const status = fallbackResult.status ?? primaryResult.status ?? 500;
            const shouldRateLimit = primaryResult.status === 429 || fallbackResult.status === 429;

            if (shouldRateLimit) {
              return reply.code(429).send({
                error: "Limite de requisições excedido. Tente novamente em alguns segundos."
              });
            }

            if (status === 401 || status === 403) {
              return reply.code(status).send({
                error: "Chave API inválida ou não autorizada. Verifique a configuração da GEMINI_API_KEY."
              });
            }

            return reply.code(status).send({
              error: fallbackResult.error || primaryResult.error || "Erro no serviço de IA"
            });
          }

          result = fallbackResult;
        }

        let generatedText = result.text;
        const shouldStore = action !== 'autocomplete' && userId && whiteboardId;
        let effectiveSessionId = sessionId;

        if (shouldStore && userId && whiteboardId) {
          const hasAccess = await ensureWhiteboardAccess(whiteboardId, userId);
          if (!hasAccess) return reply.code(403).send({ error: 'Access denied' });

          if (effectiveSessionId) {
            const { rows } = await app.db.query<{ id: string }>(
              `SELECT id FROM public.assistant_sessions
               WHERE id = $1 AND user_id = $2 AND whiteboard_id = $3
               LIMIT 1`,
              [effectiveSessionId, userId, whiteboardId]
            );
            if (!rows.length) return reply.code(403).send({ error: 'Access denied' });
          } else {
            const { rows } = await app.db.query<{ id: string }>(
              `SELECT id FROM public.assistant_sessions
               WHERE user_id = $1 AND whiteboard_id = $2
               ORDER BY updated_at DESC, created_at DESC
               LIMIT 1`,
              [userId, whiteboardId]
            );
            effectiveSessionId = rows[0]?.id;

            if (!effectiveSessionId) {
              const { rows: createdRows } = await app.db.query<{ id: string }>(
                `INSERT INTO public.assistant_sessions (user_id, whiteboard_id, title)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [userId, whiteboardId, 'Sessão 1']
              );
              effectiveSessionId = createdRows[0]?.id;
            }
          }
        }

        if (action === 'create_tasks') {
          if (!projectId) {
            return reply.code(400).send({ error: 'projectId is required for create_tasks' });
          }

          if (!userId) {
            return reply.code(401).send({ error: 'Unauthorized' });
          }

          const hasProjectAccess = await ensureProjectAccess(projectId, userId);
          if (!hasProjectAccess) return reply.code(403).send({ error: 'Access denied' });

          const jsonBlock = extractJsonBlock(generatedText);
          if (!jsonBlock) {
            return reply.code(422).send({
              error: 'Não foi possível interpretar a resposta da IA. Tente novamente com menos ambiguidade.',
            });
          }

          let plan: any;
          try {
            plan = JSON.parse(jsonBlock);
          } catch (err) {
            return reply.code(422).send({
              error: 'Resposta da IA inválida. Tente novamente com menos ambiguidade.',
            });
          }

          if (!plan || plan.type !== TASK_PLAN_TYPE || !Array.isArray(plan.tasks)) {
            return reply.code(422).send({
              error: 'Formato de plano inválido. Tente novamente.',
            });
          }

          const tasks = plan.tasks
            .filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
            .slice(0, MAX_TASKS_PER_PLAN);

          if (tasks.length === 0) {
            return reply.code(422).send({ error: 'Nenhuma tarefa válida encontrada no plano.' });
          }

          const boardMode = plan.board?.mode === 'existing' || plan.board?.mode === 'new'
            ? plan.board.mode
            : plan.board?.id
              ? 'existing'
              : 'new';

          let targetBoardId: string | null = null;
          let targetBoardName: string | null = null;
          const boardListResult = await app.db.query(
            `SELECT id, name, type FROM boards WHERE project_id = $1`,
            [projectId]
          );
          const boards = boardListResult.rows;

          const findBoardByName = (name?: string) => {
            if (!name) return null;
            const normalized = normalizeLabel(name);
            return boards.find((b: any) => normalizeLabel(b.name) === normalized) ?? null;
          };

          if (boardMode === 'existing' && plan.board?.id) {
            const board = boards.find((b: any) => b.id === plan.board.id);
            if (board) {
              targetBoardId = board.id;
              targetBoardName = board.name;
            }
          }

          if (!targetBoardId && boardMode === 'existing') {
            const boardByName = findBoardByName(plan.board?.name);
            if (boardByName) {
              targetBoardId = boardByName.id;
              targetBoardName = boardByName.name;
            }
          }

          if (!targetBoardId && boardMode === 'existing' && boards.length > 0) {
            targetBoardId = boards[0].id;
            targetBoardName = boards[0].name;
          }

          const ensureWorkflowAndStatuses = async (boardId: string) => {
            const workflowResult = await app.db.query(
              `SELECT id FROM workflows WHERE board_id = $1 AND is_default = true LIMIT 1`,
              [boardId]
            );
            if (workflowResult.rows.length === 0) {
              throw new Error('Workflow não encontrado para o board');
            }
            const wfId = workflowResult.rows[0].id as string;
            const statusResult = await app.db.query(
              `SELECT id, name, position, is_initial, is_final
               FROM workflow_statuses
               WHERE workflow_id = $1
               ORDER BY position ASC`,
              [wfId]
            );
            return { workflowId: wfId, statuses: statusResult.rows };
          };

          const createBoardWithWorkflow = async (
            name: string,
            type: string,
            columns?: string[]
          ) => {
            const boardResult = await app.db.query(
              `INSERT INTO boards (project_id, name, description, type, created_by)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id, name`,
              [projectId, name, null, type, userId]
            );
            const board = boardResult.rows[0];

            const workflowResult = await app.db.query(
              `INSERT INTO workflows (board_id, name, is_default)
               VALUES ($1, 'Default Workflow', true)
               RETURNING id`,
              [board.id]
            );
            const wfId = workflowResult.rows[0].id as string;

            const defaultColumns = ['To Do', 'In Progress', 'Done'];
            const rawColumns = Array.isArray(columns) && columns.length > 0 ? columns : defaultColumns;
            const uniqueColumns: string[] = [];
            rawColumns.forEach((col: any) => {
              const trimmed = typeof col === 'string' ? col.trim() : '';
              if (!trimmed) return;
              if (!uniqueColumns.some((c) => normalizeLabel(c) === normalizeLabel(trimmed))) {
                uniqueColumns.push(trimmed);
              }
            });

            const statusRows: { id: string; name: string; position: number; is_initial: boolean; is_final: boolean }[] = [];
            for (let i = 0; i < uniqueColumns.length; i++) {
              const statusName = uniqueColumns[i];
              const color = DEFAULT_STATUS_COLORS[i % DEFAULT_STATUS_COLORS.length];
              const { rows } = await app.db.query(
                `INSERT INTO workflow_statuses (workflow_id, name, color, position, is_initial, is_final)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, name, position, is_initial, is_final`,
                [wfId, statusName, color, i, i === 0, i === uniqueColumns.length - 1]
              );
              statusRows.push(rows[0]);
            }

            for (let i = 0; i < statusRows.length - 1; i++) {
              await app.db.query(
                `INSERT INTO workflow_transitions (workflow_id, from_status_id, to_status_id)
                 VALUES ($1, $2, $3)`,
                [wfId, statusRows[i].id, statusRows[i + 1].id]
              );
            }

            return { boardId: board.id, boardName: board.name, workflowId: wfId, statuses: statusRows };
          };

          let workflowData: { boardId: string; boardName: string; workflowId: string; statuses: any[] };

          if (!targetBoardId) {
            const boardName = (typeof plan.board?.name === 'string' && plan.board.name.trim())
              ? plan.board.name.trim()
              : `Board IA ${new Date().toLocaleDateString('pt-BR')}`;
            const boardType = plan.board?.type === 'SCRUM' ? 'SCRUM' : 'KANBAN';
            workflowData = await createBoardWithWorkflow(boardName, boardType, plan.board?.columns);
            targetBoardId = workflowData.boardId;
            targetBoardName = workflowData.boardName;
          } else {
            const data = await ensureWorkflowAndStatuses(targetBoardId);
            const existingStatuses = data.statuses as any[];

            const desiredColumns: string[] = [];
            if (Array.isArray(plan.board?.columns)) {
              plan.board.columns.forEach((col: any) => {
                if (typeof col === 'string' && col.trim()) {
                  if (!desiredColumns.some((c) => normalizeLabel(c) === normalizeLabel(col))) {
                    desiredColumns.push(col.trim());
                  }
                }
              });
            }
            tasks.forEach((task: any) => {
              if (typeof task.column === 'string' && task.column.trim()) {
                if (!desiredColumns.some((c) => normalizeLabel(c) === normalizeLabel(task.column))) {
                  desiredColumns.push(task.column.trim());
                }
              }
            });

            let maxPosition = existingStatuses.reduce((max, s) => Math.max(max, s.position), -1);
            const existingNames = new Set(existingStatuses.map((s) => normalizeLabel(s.name)));

            const createdStatuses: any[] = [];
            for (let i = 0; i < desiredColumns.length; i++) {
              const column = desiredColumns[i];
              if (existingNames.has(normalizeLabel(column))) continue;
              maxPosition += 1;
              const color = DEFAULT_STATUS_COLORS[maxPosition % DEFAULT_STATUS_COLORS.length];
              const { rows } = await app.db.query(
                `INSERT INTO workflow_statuses (workflow_id, name, color, position, is_initial, is_final)
                 VALUES ($1, $2, $3, $4, false, false)
                 RETURNING id, name, position, is_initial, is_final`,
                [data.workflowId, column, color, maxPosition]
              );
              createdStatuses.push(rows[0]);
              existingNames.add(normalizeLabel(column));
            }

            const statuses = [...existingStatuses, ...createdStatuses]
              .sort((a, b) => a.position - b.position);

            const transitionsResult = await app.db.query(
              `SELECT from_status_id, to_status_id FROM workflow_transitions WHERE workflow_id = $1`,
              [data.workflowId]
            );
            const transitionSet = new Set(
              transitionsResult.rows.map((t: any) => `${t.from_status_id}:${t.to_status_id}`)
            );

            for (let i = 0; i < statuses.length - 1; i++) {
              const from = statuses[i].id;
              const to = statuses[i + 1].id;
              const key = `${from}:${to}`;
              if (transitionSet.has(key)) continue;
              await app.db.query(
                `INSERT INTO workflow_transitions (workflow_id, from_status_id, to_status_id)
                 VALUES ($1, $2, $3)`,
                [data.workflowId, from, to]
              );
              transitionSet.add(key);
            }

            workflowData = {
              boardId: targetBoardId,
              boardName: targetBoardName ?? 'Board',
              workflowId: data.workflowId,
              statuses,
            };
          }

          const statusMap = new Map<string, any>();
          workflowData.statuses.forEach((status: any) => {
            statusMap.set(normalizeLabel(status.name), status);
          });
          const initialStatus = workflowData.statuses.find((s: any) => s.is_initial) ?? workflowData.statuses[0];

          const createTask = async (task: any) => {
            const title = String(task.title || '').trim().slice(0, 180);
            const description = typeof task.description === 'string' ? task.description.trim() : null;
            const type = TASK_TYPES.has(String(task.type).toUpperCase())
              ? String(task.type).toUpperCase()
              : 'TASK';
            const priority = TASK_PRIORITIES.has(String(task.priority).toUpperCase())
              ? String(task.priority).toUpperCase()
              : 'MEDIUM';
            const columnName = typeof task.column === 'string' ? task.column : '';
            const status = columnName
              ? statusMap.get(normalizeLabel(columnName))
              : initialStatus;

            const seqResult = await app.db.query(
              `
              WITH seq AS (
                INSERT INTO public.project_sequences (project_id, last_sequence)
                VALUES ($1, 1)
                ON CONFLICT (project_id)
                DO UPDATE SET last_sequence = public.project_sequences.last_sequence + 1
                RETURNING last_sequence
              )
              SELECT p.slug, seq.last_sequence
              FROM seq
              INNER JOIN public.projects p ON p.id = $1
              `,
              [projectId]
            );

            if (seqResult.rows.length === 0) {
              throw new Error('Project not found');
            }

            const slug = String(seqResult.rows[0].slug || 'PROJ');
            const nextNum = Number(seqResult.rows[0].last_sequence) || 1;
            const key = `${slug.toUpperCase()}-${nextNum}`;

            const tarefaResult = await app.db.query(
              `INSERT INTO tarefas (
                project_id, board_id, key, type, title, description, status_id,
                priority, assignee_id, reporter_id, labels
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING id, key, title, status_id`,
              [
                projectId,
                workflowData.boardId,
                key,
                type,
                title,
                description || null,
                status?.id || null,
                priority,
                null,
                userId,
                Array.isArray(task.labels) ? task.labels : [],
              ]
            );

            const tarefa = tarefaResult.rows[0];

            await app.db.query(
              `INSERT INTO tarefa_activity_log (tarefa_id, user_id, action, new_value)
               VALUES ($1, $2, 'created', $3)`,
              [tarefa.id, userId, title]
            );

            return {
              id: tarefa.id,
              key: tarefa.key,
              title: tarefa.title,
              status_id: tarefa.status_id,
            };
          };

          const createdTasks = [];
          for (const task of tasks) {
            createdTasks.push(await createTask(task));
          }

          const createdColumns = plan.board?.columns?.length
            ? plan.board.columns.join(', ')
            : null;

          const boardLabel = workflowData.boardName || targetBoardName || 'board';
          generatedText = `Criei ${createdTasks.length} ${createdTasks.length === 1 ? 'tarefa' : 'tarefas'} no board "${boardLabel}".` +
            (createdColumns ? ` Colunas usadas/criadas: ${createdColumns}.` : '');
        }

        if (shouldStore && userId && whiteboardId && effectiveSessionId) {
          const lastUserMessage = [...messages].reverse().find((msg) => msg.role === 'user');
          const entries = [];

          if (lastUserMessage?.content) {
            const userContent =
              action === 'analyze_selection' && lastUserMessage.content.startsWith(ANALYZE_SELECTION_PREFIX)
                ? summarizeAnalyzeSelection(lastUserMessage.content)
                : lastUserMessage.content;
            entries.push({
              role: 'user',
              content: userContent,
              action: action || null,
            });
          }

          entries.push({
            role: 'assistant',
            content: generatedText,
            action: null,
          });

          const values: any[] = [];
          const placeholders = entries.map((entry, index) => {
            const offset = index * 6;
            values.push(userId, whiteboardId, effectiveSessionId, entry.role, entry.content, entry.action);
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
          });

          try {
            await app.db.query(
              `INSERT INTO public.assistant_messages (user_id, whiteboard_id, session_id, role, content, action)
               VALUES ${placeholders.join(', ')}`,
              values
            );
            await app.db.query(
              `UPDATE public.assistant_sessions
               SET updated_at = now()
               WHERE id = $1`,
              [effectiveSessionId]
            );
          } catch (err) {
            app.log.error({ err, userId, whiteboardId, sessionId: effectiveSessionId }, 'Failed to store assistant messages');
          }
        }

        return reply.send({
          content: generatedText,
          finishReason: result.finishReason || "stop"
        });
      } catch (error) {
        app.log.error(error, 'bear-assistant error');
        return reply.code(500).send({
          error: error instanceof Error ? error.message : "Erro desconhecido"
        });
      }
    }
  );
}
