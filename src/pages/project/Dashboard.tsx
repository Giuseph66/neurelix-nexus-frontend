import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PenTool, ListTodo, GitBranch, Users } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function Dashboard() {
  const { projectId } = useParams();

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch(`/projects/${projectId}`);
    },
    enabled: !!projectId,
  });

  usePageTitle("Dashboard", project?.name);

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return { members: [] };
      return await apiFetch<{ members: Array<{ id: string; role: string; user_id: string; created_at: string; profiles: { full_name: string | null } | null }> }>(`/projects/${projectId}/members`);
    },
    enabled: !!projectId,
  });
  
  const members = membersData?.members || [];

  if (projectLoading || membersLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      title: "Quadros",
      value: "0",
      description: "Quadros brancos criados",
      icon: PenTool,
      color: "text-info",
    },
    {
      title: "Tarefas",
      value: "0",
      description: "Tarefas no backlog",
      icon: ListTodo,
      color: "text-success",
    },
    {
      title: "Branches",
      value: "0",
      description: "Branches ativas",
      icon: GitBranch,
      color: "text-warning",
    },
    {
      title: "Membros",
      value: members?.length?.toString() || "0",
      description: "Pessoas na equipe",
      icon: Users,
      color: "text-primary",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{project?.name}</h1>
        {project?.description && (
          <p className="text-muted-foreground mt-1">{project.description}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atividade Recente</CardTitle>
            <CardDescription>Últimas ações no projeto</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Nenhuma atividade ainda
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipe</CardTitle>
            <CardDescription>Membros do projeto</CardDescription>
          </CardHeader>
          <CardContent>
            {members && members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                        {member.profiles?.full_name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <span className="text-sm">
                        {member.profiles?.full_name || "Usuário"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {member.role.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                Nenhum membro
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
