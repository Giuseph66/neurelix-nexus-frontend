import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Loader2, PenTool, ListTodo, GitBranch, Users, GitPullRequest, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useBacklog } from "@/hooks/useBacklog";
import { useSelectedRepos } from "@/hooks/useSelectRepos";
import { PRIORITY_CONFIG, TYPE_CONFIG } from "@/types/tarefas";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  // Buscar quadros brancos
  const { data: whiteboardsData, isLoading: whiteboardsLoading } = useQuery({
    queryKey: ["whiteboards", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      return await apiFetch<any[]>(`/whiteboards?projectId=${projectId}`, { auth: true });
    },
    enabled: !!projectId,
  });

  // Buscar tarefas
  const { data: backlogData, isLoading: backlogLoading } = useBacklog(projectId);

  // Buscar repositórios selecionados
  const { data: selectedReposData, isLoading: reposLoading } = useSelectedRepos(projectId);

  // Buscar branches de todos os repositórios
  const repos = selectedReposData?.repos || [];
  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ["project-branches", projectId, repos.map((r: any) => r.id).join(",")],
    queryFn: async () => {
      if (!repos || repos.length === 0) return { totalBranches: 0 };
      
      // Buscar branches de todos os repositórios em paralelo
      const branchesPromises = repos.map(async (repo: any) => {
        try {
          const data = await apiFetch(`/functions/v1/github-code/repos/${repo.id}/branches`, { auth: true });
          return (data as { branches: any[] })?.branches || [];
        } catch (error) {
          console.error(`Error fetching branches for repo ${repo.id}:`, error);
          return [];
        }
      });

      const allBranches = await Promise.all(branchesPromises);
      const totalBranches = allBranches.reduce((total, branches) => total + branches.length, 0);
      
      return { totalBranches };
    },
    enabled: !!projectId && repos.length > 0,
  });

  // Buscar PRs abertos de todos os repositórios
  const { data: prsData, isLoading: prsLoading } = useQuery({
    queryKey: ["project-prs", projectId, repos.map((r: any) => r.id).join(",")],
    queryFn: async () => {
      if (!repos || repos.length === 0) return { prs: [], totalOpen: 0 };
      
      const prsPromises = repos.map(async (repo: any) => {
        try {
          const data = await apiFetch(`/functions/v1/github-pulls/repos/${repo.id}/pulls?state=open`, { auth: true });
          return (data as { prs: any[] })?.prs || [];
        } catch (error) {
          console.error(`Error fetching PRs for repo ${repo.id}:`, error);
          return [];
        }
      });

      const allPRs = await Promise.all(prsPromises);
      const flatPRs = allPRs.flat();
      const recentPRs = flatPRs
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      
      return { prs: flatPRs, totalOpen: flatPRs.length, recentPRs };
    },
    enabled: !!projectId && repos.length > 0,
  });

  const members = membersData?.members || [];
  const whiteboardsCount = whiteboardsData?.length || 0;
  const tarefas = backlogData?.tarefas || [];
  const tarefasCount = tarefas.length;
  const branchesCount = branchesData?.totalBranches || 0;
  const prsOpen = prsData?.totalOpen || 0;
  const recentPRs = prsData?.recentPRs || [];

  // Calcular distribuição de tarefas por prioridade
  const priorityDistribution = Object.keys(PRIORITY_CONFIG).map(priority => {
    const count = tarefas.filter((t: any) => t.priority === priority).length;
    return {
      name: PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG].label,
      value: count,
      color: PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG].color,
    };
  }).filter(item => item.value > 0);

  // Calcular distribuição de tarefas por tipo
  const typeDistribution = Object.keys(TYPE_CONFIG).map(type => {
    const count = tarefas.filter((t: any) => t.type === type).length;
    return {
      name: TYPE_CONFIG[type as keyof typeof TYPE_CONFIG].label,
      value: count,
      color: TYPE_CONFIG[type as keyof typeof TYPE_CONFIG].color,
    };
  }).filter(item => item.value > 0);

  // Tarefas recentes (últimas 5)
  const recentTarefas = tarefas
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Calcular progresso (tarefas concluídas vs total)
  // Uma tarefa é considerada concluída quando seu status tem is_final = true
  const tarefasConcluidas = tarefas.filter((t: any) => t.status?.is_final === true).length;
  const tarefasPendentes = tarefasCount - tarefasConcluidas;
  const progressPercent = tarefasCount > 0 ? Math.round((tarefasConcluidas / tarefasCount) * 100) : 0;

  const isLoading = projectLoading || membersLoading || whiteboardsLoading || backlogLoading || reposLoading || branchesLoading || prsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      title: "Quadros",
      value: whiteboardsCount.toString(),
      description: "Quadros brancos criados",
      icon: PenTool,
      color: "text-blue-500",
      bgGradient: "from-blue-500/10 to-blue-600/5",
    },
    {
      title: "Tarefas",
      value: tarefasCount.toString(),
      description: `${tarefasConcluidas} concluídas`,
      icon: ListTodo,
      color: "text-green-500",
      bgGradient: "from-green-500/10 to-green-600/5",
      progress: progressPercent,
    },
    {
      title: "Branches",
      value: branchesCount.toString(),
      description: "Branches ativas",
      icon: GitBranch,
      color: "text-yellow-500",
      bgGradient: "from-yellow-500/10 to-yellow-600/5",
    },
    {
      title: "PRs Abertos",
      value: prsOpen.toString(),
      description: "Pull requests pendentes",
      icon: GitPullRequest,
      color: "text-purple-500",
      bgGradient: "from-purple-500/10 to-purple-600/5",
    },
  ];

  const chartConfig = {
    tarefas: {
      label: "Tarefas",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {project?.name}
          </h1>
          {project?.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{members?.length || 0} membros</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card 
            key={stat.title} 
            className="relative overflow-hidden border-2 transition-all hover:shadow-lg hover:scale-[1.02] duration-300"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <p className="text-xs text-muted-foreground mb-2">{stat.description}</p>
              {stat.progress !== undefined && (
                <Progress value={stat.progress} className="h-2" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts and Activity */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Distribuição por Prioridade */}
        {priorityDistribution.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Tarefas por Prioridade
              </CardTitle>
              <CardDescription>Distribuição das tarefas</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <PieChart>
                  <Pie
                    data={priorityDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {priorityDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Distribuição por Tipo */}
        {typeDistribution.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="h-4 w-4" />
                Tarefas por Tipo
              </CardTitle>
              <CardDescription>Tipos de tarefas no projeto</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart data={typeDistribution}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-tarefas)">
                    {typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Progresso Geral */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Progresso do Projeto
            </CardTitle>
            <CardDescription>Conclusão de tarefas</CardDescription>
          </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tarefas Concluídas</span>
                  <span className="text-2xl font-bold text-green-500">
                    {tarefasConcluidas}/{tarefasCount}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-4" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progressPercent}% completo</span>
                  <span>{tarefasPendentes} pendentes</span>
                </div>
                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <p className="italic">
                    * Tarefas com status marcado como "final" são consideradas concluídas
                  </p>
                </div>
              </div>
            </CardContent>
        </Card>
      </div>

      {/* Activity and Team */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Atividade Recente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Atividade Recente
            </CardTitle>
            <CardDescription>Últimas ações no projeto</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Tarefas Recentes */}
              {recentTarefas.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Tarefas Criadas</h4>
                  {recentTarefas.map((tarefa: any) => {
                    const typeConfig = TYPE_CONFIG[tarefa.type as keyof typeof TYPE_CONFIG];
                    const Icon = typeConfig?.icon || ListTodo;
                    return (
                      <div key={tarefa.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div 
                          className="h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${typeConfig?.color}20` }}
                        >
                          <Icon className="h-4 w-4" style={{ color: typeConfig?.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{tarefa.key}</span>
                            <span className="text-sm font-medium truncate">{tarefa.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(tarefa.created_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* PRs Recentes */}
              {recentPRs.length > 0 && (
                <div className="space-y-3 mt-4 pt-4 border-t">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase">Pull Requests</h4>
                  {recentPRs.map((pr: any) => (
                    <div key={pr.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="h-8 w-8 rounded-md bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                        <GitPullRequest className="h-4 w-4 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">#{pr.number}</span>
                          <span className="text-sm font-medium truncate">{pr.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {recentTarefas.length === 0 && recentPRs.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                  Nenhuma atividade ainda
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Equipe */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </CardTitle>
            <CardDescription>{members?.length || 0} membros do projeto</CardDescription>
          </CardHeader>
          <CardContent>
            {members && members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-sm font-medium text-primary border-2 border-primary/20">
                        {member.profiles?.full_name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <span className="text-sm font-medium block">
                          {member.profiles?.full_name || "Usuário"}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {member.role.replace("_", " ")}
                        </span>
                      </div>
                    </div>
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
