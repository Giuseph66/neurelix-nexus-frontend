import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";

interface AppHeaderProps {
  pageTitle?: string;
}

export function AppHeader({ pageTitle }: AppHeaderProps) {
  const { projectId } = useParams();
  const location = useLocation();
  
  // Verificar se estamos na página do whiteboard
  const isWhiteboardPage = location.pathname.includes('/whiteboard');

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch(`/projects/${projectId}`);
    },
    enabled: !!projectId,
  });

  const { data: roleData } = useQuery({
    queryKey: ["project-role", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const data = await apiFetch<{ role: string }>(`/projects/${projectId}/role`);
      return data.role;
    },
    enabled: !!projectId,
  });
  
  const memberRole = roleData || null;

  const getRoleBadgeVariant = (role: string | null | undefined) => {
    switch (role) {
      case "admin":
        return "default";
      case "tech_lead":
        return "secondary";
      case "developer":
        return "outline";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string | null | undefined) => {
    switch (role) {
      case "admin":
        return "Admin";
      case "tech_lead":
        return "Tech Lead";
      case "developer":
        return "Developer";
      case "viewer":
        return "Viewer";
      default:
        return role;
    }
  };

  type Crumb = { label: string; to?: string };

  const getProjectLabel = () => {
    const name = (project as any)?.name as string | undefined;
    if (name && name.trim()) return name;
    if (projectId) return `Projeto ${String(projectId).slice(0, 8)}`;
    return "Projeto";
  };

  const routeLabel = (segment: string) => {
    switch (segment) {
      case "dashboard":
        return "Dashboard";
      case "whiteboard":
        return "Quadro Branco";
      case "tarefas":
        return "Tarefas";
      case "code":
        return "Código";
      case "team":
        return "Equipe";
      case "roles":
        return "Papéis";
      case "settings":
        return "Configurações";
      case "repos":
        return "Repositórios";
      case "select-repos":
        return "Selecionar Repositórios";
      case "pull-requests":
        return "Pull Requests";
      case "reviews":
        return "Reviews";
      case "inbox":
        return "Inbox";
      case "branches":
        return "Branches";
      case "commits":
        return "Commits";
      case "tree":
        return "Arquivos";
      default:
        return segment;
    }
  };

  const buildBreadcrumbs = (): Crumb[] => {
    const path = location.pathname;

    // Dentro do ProjectLayout sempre teremos /project/:projectId/...
    if (!projectId || !path.startsWith(`/project/${projectId}`)) {
      return [];
    }

    const crumbs: Crumb[] = [
      { label: "Projetos", to: "/projects" },
      { label: getProjectLabel(), to: `/project/${projectId}/dashboard` },
    ];

    const rest = path.replace(`/project/${projectId}`, "");
    const parts = rest.split("/").filter(Boolean); // ex: ["team","roles"] ou ["code","repos",":repoId","pull-requests"]

    if (parts.length === 0) {
      return crumbs;
    }

    // Se foi passado pageTitle explicitamente, a gente mantém como última página,
    // mas ainda assim construímos as migalhas intermediárias baseadas na rota.
    const effectiveParts = parts.slice();

    let acc = `/project/${projectId}`;
    for (let i = 0; i < effectiveParts.length; i++) {
      const part = effectiveParts[i];

      // Pula IDs "dinâmicos" quando fizer sentido e cria um label mais amigável
      // (mas ainda mantém o link correto até aquele ponto).
      let label = routeLabel(part);

      // Ex: /code/repos/:repoId/... => em vez de mostrar o UUID inteiro
      if (effectiveParts[i - 1] === "repos" && part) {
        label = `Repo ${part.slice(0, 8)}`;
      }
      if (effectiveParts[i - 1] === "pull-requests" && part) {
        label = `PR #${part}`;
      }
      if (effectiveParts[i - 1] === "commits" && part) {
        label = `Commit ${part.slice(0, 7)}`;
      }

      acc += `/${part}`;

      // Último item vira página (sem link), a não ser que exista pageTitle (aí o pageTitle é o último)
      const isLast = i === effectiveParts.length - 1;
      const shouldLink = !isLast || !!pageTitle;

      crumbs.push({
        label,
        to: shouldLink ? acc : undefined,
      });
    }

    if (pageTitle) {
      crumbs.push({ label: pageTitle });
    }

    // Evita duplicar "Configurações" no caso /team/roles e pageTitle também ser Configurações etc.
    const deduped: Crumb[] = [];
    for (const c of crumbs) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.label === c.label) continue;
      deduped.push(c);
    }

    return deduped;
  };

  const crumbs = buildBreadcrumbs();

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      {!isWhiteboardPage && (
        <>
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </>
      )}

      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          {crumbs.map((c, idx) => {
            const isLast = idx === crumbs.length - 1;
            return (
              <span key={`${c.label}-${idx}`} className="inline-flex items-center gap-1.5">
                <BreadcrumbItem>
                  {isLast || !c.to ? (
                    <BreadcrumbPage>{c.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {memberRole && (
        <Badge variant={getRoleBadgeVariant(memberRole)} className="text-2xs">
          {getRoleLabel(memberRole)}
        </Badge>
      )}
    </header>
  );
}
