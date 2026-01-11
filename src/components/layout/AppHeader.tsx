import { useParams, useLocation } from "react-router-dom";
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
          {project && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/projects">Projetos</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/project/${projectId}/dashboard`}>
                  {project.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          {pageTitle && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
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
