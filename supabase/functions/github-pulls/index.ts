import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { validateAuth, canMergePR, getProjectRole } from "../_shared/permissions.ts";
import { Octokit } from "https://esm.sh/@octokit/rest@20.0.1";
import { processAutoLink } from "../_shared/auto-link.ts";
import { logAuditEvent } from "../_shared/audit.ts";
import { updateTarefaStatusFromPR } from "../_shared/tarefa-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let path = url.pathname;
    
    // Normalizar path
    const prefixes = ["/functions/v1/github-pulls", "/github-pulls"];
    for (const prefix of prefixes) {
      if (path.startsWith(prefix)) {
        path = path.slice(prefix.length);
        break;
      }
    }
    
    if (path === "" || path === "/") {
      path = "/";
    } else if (!path.startsWith("/")) {
      path = "/" + path;
    }

    const authHeader = req.headers.get("authorization");
    const { userId, error: authError } = await validateAuth(authHeader);
    
    if (authError || !userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedPath = path === "/" ? "/" : path.replace(/^\/+/, "/");
    const pathParts = normalizedPath.split("/").filter(Boolean);

    console.log("github-pulls path parsing:", {
      originalPath: url.pathname,
      normalizedPath,
      pathParts,
      method: req.method,
    });

    // GET /repos/:repoId/pulls
    if (req.method === "GET" && pathParts.length === 3 && pathParts[0] === "repos" && pathParts[2] === "pulls") {
      const repoId = pathParts[1];
      return await handleGetPulls(req, repoId, userId);
    }

    // GET /pulls/:repoId/:number
    if (req.method === "GET" && pathParts.length === 3 && pathParts[0] === "pulls") {
      const repoId = pathParts[1];
      const prNumber = parseInt(pathParts[2]);
      return await handleGetPRDetail(repoId, prNumber, userId);
    }

    // POST /repos/:repoId/pulls/:number/reviews
    if (req.method === "POST" && pathParts.length === 5 && pathParts[0] === "repos" && pathParts[2] === "pulls" && pathParts[4] === "reviews") {
      const repoId = pathParts[1];
      const prNumber = parseInt(pathParts[3]);
      return await handleSubmitReview(req, repoId, prNumber, userId);
    }

    // POST /repos/:repoId/pulls/:number/comments
    if (req.method === "POST" && pathParts.length === 5 && pathParts[0] === "repos" && pathParts[2] === "pulls" && pathParts[4] === "comments") {
      const repoId = pathParts[1];
      const prNumber = parseInt(pathParts[3]);
      return await handleCreateComment(req, repoId, prNumber, userId);
    }

    // POST /repos/:repoId/pulls/:number/inline-comments
    if (req.method === "POST" && pathParts.length === 5 && pathParts[0] === "repos" && pathParts[2] === "pulls" && pathParts[4] === "inline-comments") {
      const repoId = pathParts[1];
      const prNumber = parseInt(pathParts[3]);
      return await handleCreateInlineComment(req, repoId, prNumber, userId);
    }

    // POST /repos/:repoId/pulls/:number/merge
    if (req.method === "POST" && pathParts.length === 5 && pathParts[0] === "repos" && pathParts[2] === "pulls" && pathParts[4] === "merge") {
      const repoId = pathParts[1];
      const prNumber = parseInt(pathParts[3]);
      return await handleMergePR(req, repoId, prNumber, userId);
    }

    return new Response(
      JSON.stringify({ error: "Not found", path: normalizedPath }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("github-pulls error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Get GitHub client from connection
 */
async function getGitHubClientForRepo(repoId: string): Promise<{ octokit: Octokit; repo: any; projectId: string } | null> {
  const { data: repo } = await supabase
    .from("repos")
    .select("connection_id, project_id, full_name")
    .eq("id", repoId)
    .maybeSingle();

  if (!repo || !repo.connection_id) return null;

  const { data: connection } = await supabase
    .from("provider_connections")
    .select("access_token_encrypted")
    .eq("id", repo.connection_id)
    .eq("status", "active")
    .maybeSingle();

  if (!connection || !connection.access_token_encrypted) return null;

  const octokit = new Octokit({
    auth: connection.access_token_encrypted,
  });

  return { octokit, repo, projectId: repo.project_id };
}

/**
 * GET /repos/:repoId/pulls - Lista Pull Requests
 */
async function handleGetPulls(req: Request, repoId: string, userId: string) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "open";
  const search = url.searchParams.get("search") || "";

  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    const { data: pulls } = await octokit.pulls.list({
      owner,
      repo: repoName,
      state: state as "open" | "closed" | "all",
      per_page: 100,
    });

    // Filter by search
    let filteredPulls = pulls || [];
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPulls = filteredPulls.filter(
        (pr: any) =>
          pr.title.toLowerCase().includes(searchLower) ||
          pr.body?.toLowerCase().includes(searchLower) ||
          pr.head.ref.toLowerCase().includes(searchLower)
      );
    }

    // Format PRs
    const formattedPRs = filteredPulls.map((pr: any) => ({
      id: pr.id.toString(),
      repo_id: repoId,
      number: pr.number,
      title: pr.title,
      description: pr.body || "",
      state: pr.state.toUpperCase(),
      source_branch: pr.head.ref,
      target_branch: pr.base.ref,
      author_username: pr.user.login,
      draft: pr.draft || false,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      url: pr.html_url,
    }));

    // Auto-link PRs with TSK-123
    for (const pr of formattedPRs) {
      const textToSearch = `${pr.title} ${pr.description} ${pr.source_branch}`;
      await processAutoLink(
        textToSearch,
        clientData.projectId,
        repoId,
        "pull_request",
        pr.id,
        { branchName: pr.source_branch, prNumber: pr.number }
      );
    }

    return new Response(
      JSON.stringify({ prs: formattedPRs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching pulls:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch pull requests" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * GET /pulls/:repoId/:number - Detalhe do PR
 */
async function handleGetPRDetail(repoId: string, prNumber: number, userId: string) {
  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    // Get PR details
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    // Get commits
    const { data: commits } = await octokit.pulls.listCommits({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    // Get files changed
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    // Get reviews
    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    // Format PR
    const formattedPR = {
      id: pr.id.toString(),
      repo_id: repoId,
      number: pr.number,
      title: pr.title,
      description: pr.body || "",
      state: pr.state.toUpperCase(),
      source_branch: pr.head.ref,
      target_branch: pr.base.ref,
      author_username: pr.user.login,
      draft: pr.draft || false,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      url: pr.html_url,
      commits: (commits || []).map((c: any) => ({
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
      })),
      files: (files || []).map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
        blob_url: f.blob_url,
        raw_url: f.raw_url,
      })),
      reviews: (reviews || []).map((r: any) => ({
        id: r.id,
        state: r.state,
        reviewer: r.user.login,
        body: r.body,
        submitted_at: r.submitted_at,
      })),
    };

    // Auto-link PR
    const textToSearch = `${pr.title} ${pr.body || ""} ${pr.head.ref}`;
    const linkedKeys = await processAutoLink(
      textToSearch,
      clientData.projectId,
      repoId,
      "pull_request",
      formattedPR.id,
      { branchName: pr.head.ref, prNumber: pr.number }
    );

    // Get linked tarefas
    const { data: links } = await supabase
      .from("tarefa_git_links")
      .select("tarefa_id, tarefas(id, key, title)")
      .eq("pr_number", prNumber)
      .or(`branch.eq.${pr.head.ref},commit_sha.in.(${(commits || []).map((c: any) => c.sha).join(",")})`);

    return new Response(
      JSON.stringify({
        pr: formattedPR,
        linked_tarefas: links?.map((l: any) => l.tarefas).filter(Boolean) || [],
        detected_keys: linkedKeys,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching PR detail:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch PR detail" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /repos/:repoId/pulls/:number/reviews - Submeter review
 */
async function handleSubmitReview(req: Request, repoId: string, prNumber: number, userId: string) {
  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo, projectId } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    const body = await req.json();
    const { state, body: reviewBody } = body;

    if (!state || !["APPROVED", "CHANGES_REQUESTED", "COMMENTED"].includes(state)) {
      return new Response(
        JSON.stringify({ error: "Invalid review state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Submit review to GitHub
    const { data: review } = await octokit.pulls.createReview({
      owner,
      repo: repoName,
      pull_number: prNumber,
      event: state === "APPROVED" ? "APPROVE" : state === "CHANGES_REQUESTED" ? "REQUEST_CHANGES" : "COMMENT",
      body: reviewBody || "",
    });

    // Get user info
    const { data: user } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();

    // Get PR record
    const { data: prRecord } = await supabase
      .from("pull_requests")
      .select("id")
      .eq("repo_id", repoId)
      .eq("number", prNumber)
      .maybeSingle();

    if (prRecord) {
      // Save review to database
      await supabase
        .from("pr_reviews")
        .upsert({
          pr_id: prRecord.id,
          reviewer_id: userId,
          reviewer_username: review.user.login,
          state: state,
          body: reviewBody || "",
          submitted_at: review.submitted_at,
        }, {
          onConflict: "pr_id,reviewer_id",
        });

      // Auto-link TSK-123 if present in review body
      if (reviewBody) {
        await processAutoLink(
          reviewBody,
          projectId,
          repoId,
          "pull_request",
          prRecord.id,
          { branchName: "", prNumber }
        );
      }

      // Log audit event
      await logAuditEvent(
        userId,
        "REVIEW",
        "pull_request",
        prRecord.id,
        null,
        { state, pr_number: prNumber, repo_id: repoId }
      );
    }

    return new Response(
      JSON.stringify({ review }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error submitting review:", error);
    return new Response(
      JSON.stringify({ error: "Failed to submit review" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /repos/:repoId/pulls/:number/comments - Criar comentário geral
 */
async function handleCreateComment(req: Request, repoId: string, prNumber: number, userId: string) {
  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo, projectId } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    const body = await req.json();
    const { body: commentBody } = body;

    if (!commentBody) {
      return new Response(
        JSON.stringify({ error: "Comment body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create comment on GitHub
    const { data: comment } = await octokit.issues.createComment({
      owner,
      repo: repoName,
      issue_number: prNumber,
      body: commentBody,
    });

    // Get PR record
    const { data: prRecord } = await supabase
      .from("pull_requests")
      .select("id")
      .eq("repo_id", repoId)
      .eq("number", prNumber)
      .maybeSingle();

    if (prRecord) {
      // Save comment to database
      await supabase
        .from("pr_comments")
        .insert({
          pr_id: prRecord.id,
          author_id: userId,
          body: commentBody,
        });

      // Auto-link TSK-123 if present
      await processAutoLink(
        commentBody,
        projectId,
        repoId,
        "pull_request",
        prRecord.id,
        { branchName: "", prNumber }
      );
    }

    return new Response(
      JSON.stringify({ comment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating comment:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create comment" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /repos/:repoId/pulls/:number/inline-comments - Criar comentário inline
 */
async function handleCreateInlineComment(req: Request, repoId: string, prNumber: number, userId: string) {
  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo, projectId } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    const body = await req.json();
    const { body: commentBody, path, line, side, in_reply_to_id } = body;

    if (!commentBody || !path || !line) {
      return new Response(
        JSON.stringify({ error: "Comment body, path, and line are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get PR to find commit SHA
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    // Create inline comment on GitHub
    const { data: comment } = await octokit.pulls.createReviewComment({
      owner,
      repo: repoName,
      pull_number: prNumber,
      body: commentBody,
      path,
      line,
      side: side === "LEFT" ? "LEFT" : "RIGHT",
      commit_id: pr.head.sha,
      in_reply_to: in_reply_to_id ? parseInt(in_reply_to_id) : undefined,
    });

    // Get PR record
    const { data: prRecord } = await supabase
      .from("pull_requests")
      .select("id")
      .eq("repo_id", repoId)
      .eq("number", prNumber)
      .maybeSingle();

    if (prRecord) {
      // Save comment to database
      await supabase
        .from("pr_comments")
        .insert({
          pr_id: prRecord.id,
          author_id: userId,
          body: commentBody,
          path,
          line_number: line,
          side: side,
          in_reply_to_id: in_reply_to_id || null,
        });
    }

    return new Response(
      JSON.stringify({ comment }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating inline comment:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create inline comment" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * POST /repos/:repoId/pulls/:number/merge - Fazer merge do PR
 */
async function handleMergePR(req: Request, repoId: string, prNumber: number, userId: string) {
  const clientData = await getGitHubClientForRepo(repoId);
  if (!clientData) {
    return new Response(
      JSON.stringify({ error: "Repository or connection not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { octokit, repo, projectId } = clientData;
  const [owner, repoName] = repo.full_name.split("/");

  try {
    // Get PR record to check permissions
    const { data: prRecord } = await supabase
      .from("pull_requests")
      .select("id")
      .eq("repo_id", repoId)
      .eq("number", prNumber)
      .maybeSingle();

    if (!prRecord) {
      return new Response(
        JSON.stringify({ error: "PR not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check merge permissions
    const canMerge = await canMergePR(userId, prRecord.id);
    if (!canMerge) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions to merge PR" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { method = "merge", commit_message } = body;

    // Merge PR on GitHub
    const { data: mergeResult } = await octokit.pulls.merge({
      owner,
      repo: repoName,
      pull_number: prNumber,
      merge_method: method as "merge" | "squash" | "rebase",
      commit_message: commit_message,
    });

    if (!mergeResult.merged) {
      return new Response(
        JSON.stringify({ error: mergeResult.message || "Failed to merge PR" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update PR state in database
    await supabase
      .from("pull_requests")
      .update({
        state: "MERGED",
        merged_at: new Date().toISOString(),
        merge_commit_sha: mergeResult.sha,
      })
      .eq("id", prRecord.id);

    // Update tarefa status
    await updateTarefaStatusFromPR(prRecord.id, "MERGED", projectId);

    // Log audit event
    await logAuditEvent(
      userId,
      "MERGE",
      "pull_request",
      prRecord.id,
      null,
      { method, pr_number: prNumber, repo_id: repoId, merge_sha: mergeResult.sha }
    );

    return new Response(
      JSON.stringify({ merged: true, sha: mergeResult.sha }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error merging PR:", error);
    return new Response(
      JSON.stringify({ error: "Failed to merge PR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

