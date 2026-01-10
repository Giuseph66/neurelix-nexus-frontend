import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Normalize path
    let path = pathname;
    const prefixes = ["/functions/v1/project-invites", "/project-invites"];
    for (const prefix of prefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length);
        break;
      }
    }

    if (path === "" || path === "/") {
      path = "/";
    }

    // Rota pública: aceitar convite por token (sem auth)
    if (req.method === "POST" && path.startsWith("/accept/")) {
      const tokenFromPath = path.split("/accept/")[1];
      return await handleAcceptInvite(req, tokenFromPath);
    }

    // A partir daqui, todas as rotas exigem autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route handlers
    if (req.method === "POST" && path === "/") {
      return await handleCreateInvite(req, user.id);
    } else if (req.method === "GET" && path === "/") {
      return await handleGetInvites(req, user.id);
    } else if (req.method === "DELETE" && path.startsWith("/")) {
      const inviteId = path.slice(1);
      return await handleDeleteInvite(req, inviteId, user.id);
    } else {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in project-invites function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * POST / - Criar convite
 */
async function handleCreateInvite(req: Request, userId: string) {
  try {
    const body = await req.json();
    const { projectId, email, role = "developer" } = body;

    if (!projectId || !email) {
      return new Response(
        JSON.stringify({ error: "projectId and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar permissões: apenas admin ou tech_lead podem convidar
    const { data: member, error: memberError } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (member.role !== "admin" && member.role !== "tech_lead") {
      return new Response(
        JSON.stringify({ error: "Only admins and tech leads can invite members" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Nota: Não podemos consultar auth.users diretamente do Edge Function
    // A verificação se o usuário já é membro será feita quando ele tentar aceitar o convite
    // Por enquanto, apenas verificamos se já existe convite ativo

    // Verificar se já existe convite ativo para esse email/projeto
    const { data: existingInvite } = await supabase
      .from("project_invites")
      .select("id")
      .eq("project_id", projectId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return new Response(
        JSON.stringify({ error: "An active invite already exists for this email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar convite
    const { data: invite, error: inviteError } = await supabase
      .from("project_invites")
      .insert({
        project_id: projectId,
        email,
        role,
        invited_by: userId,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invite:", inviteError);
      return new Response(
        JSON.stringify({ error: "Failed to create invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Enviar email de convite aqui
    // Por enquanto, apenas retornar o convite criado
    // O email será enviado em uma função separada ou aqui mesmo quando integrarmos serviço de email

    return new Response(
      JSON.stringify({ invite }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleCreateInvite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /?projectId=... - Listar convites pendentes
 */
async function handleGetInvites(req: Request, userId: string) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se usuário é membro do projeto
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!member) {
      return new Response(
        JSON.stringify({ error: "Project not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar convites pendentes
    const { data: invites, error: invitesError } = await supabase
      .from("project_invites")
      .select(`
        id,
        email,
        role,
        token,
        expires_at,
        created_at,
        invited_by,
        profiles:invited_by(full_name)
      `)
      .eq("project_id", projectId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (invitesError) {
      console.error("Error fetching invites:", invitesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch invites" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ invites: invites || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleGetInvites:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /accept/:token - Aceitar convite (público)
 */
async function handleAcceptInvite(req: Request, token: string) {
  try {
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar convite por token
    const { data: invite, error: inviteError } = await supabase
      .from("project_invites")
      .select(`
        id,
        project_id,
        email,
        role,
        expires_at,
        accepted_at
      `)
      .eq("token", token)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired invite token" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se já foi aceito
    if (invite.accepted_at) {
      return new Response(
        JSON.stringify({ error: "Invite has already been accepted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se expirou
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Invite has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Obter email do usuário autenticado (se houver)
    const authHeader = req.headers.get("Authorization");
    let userEmail: string | null = null;
    let userId: string | null = null;

    if (authHeader) {
      const userToken = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(userToken);
      if (user) {
        userEmail = user.email || null;
        userId = user.id;
      }
    }

    // Se não estiver autenticado, retornar informações do convite para o frontend processar
    if (!userId || !userEmail) {
      return new Response(
        JSON.stringify({
          invite: {
            project_id: invite.project_id,
            email: invite.email,
            role: invite.role,
          },
          requiresAuth: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se o email do usuário corresponde ao email do convite
    if (userEmail.toLowerCase() !== invite.email.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Email does not match the invite" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se já é membro
    const { data: existingMember } = await supabase
      .from("project_members")
      .select("id")
      .eq("project_id", invite.project_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMember) {
      // Marcar convite como aceito mesmo que já seja membro
      await supabase
        .from("project_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({
          message: "Already a member",
          project_id: invite.project_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Adicionar usuário como membro do projeto
    const { error: memberError } = await supabase
      .from("project_members")
      .insert({
        project_id: invite.project_id,
        user_id: userId,
        role: invite.role,
      });

    if (memberError) {
      console.error("Error adding member:", memberError);
      return new Response(
        JSON.stringify({ error: "Failed to add member to project" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Marcar convite como aceito
    await supabase
      .from("project_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({
        message: "Invite accepted successfully",
        project_id: invite.project_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleAcceptInvite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * DELETE /:id - Cancelar convite
 */
async function handleDeleteInvite(req: Request, inviteId: string, userId: string) {
  try {
    if (!inviteId) {
      return new Response(
        JSON.stringify({ error: "Invite ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar convite
    const { data: invite, error: inviteError } = await supabase
      .from("project_invites")
      .select("project_id, invited_by")
      .eq("id", inviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar permissões: apenas quem criou ou admin/tech_lead
    const { data: member } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", invite.project_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!member) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canDelete =
      invite.invited_by === userId ||
      member.role === "admin" ||
      member.role === "tech_lead";

    if (!canDelete) {
      return new Response(
        JSON.stringify({ error: "Only the invite creator or admins can delete invites" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deletar convite
    const { error: deleteError } = await supabase
      .from("project_invites")
      .delete()
      .eq("id", inviteId);

    if (deleteError) {
      console.error("Error deleting invite:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete invite" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Invite deleted successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleDeleteInvite:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

