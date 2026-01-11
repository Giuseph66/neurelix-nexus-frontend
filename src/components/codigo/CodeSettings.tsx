import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Code2, 
  GitPullRequest, 
  Settings, 
  Plus, 
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  Github
} from 'lucide-react';
import { useSelectedRepos } from '@/hooks/useSelectRepos';
import { useGitHubConnection, useRevokeGitHubConnection } from '@/hooks/useGitHubOAuth';
import { SelectReposPage } from './SelectReposPage';

export function CodeSettings() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [showAddRepos, setShowAddRepos] = useState(false);
  
  const { data: selectedReposData, isLoading } = useSelectedRepos(projectId);
  const { data: connection } = useGitHubConnection(projectId);
  const revokeConnection = useRevokeGitHubConnection();
  const repos = selectedReposData?.repos || [];

  // Obter repositório ativo do localStorage
  const getActiveRepoId = () => {
    if (!projectId) return null;
    const key = `active-repo-${projectId}`;
    return localStorage.getItem(key);
  };

  const setActiveRepoId = (repoId: string) => {
    if (!projectId) return;
    const key = `active-repo-${projectId}`;
    localStorage.setItem(key, repoId);
    // Navegar para o código do repositório
    navigate(`/project/${projectId}/code/repos/${repoId}`, { replace: true });
  };

  const activeRepoId = getActiveRepoId();

  if (showAddRepos) {
    return (
      <div className="h-full flex flex-col">
        <div className="border-b p-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddRepos(false)}
          >
            ← Voltar
          </Button>
          <h2 className="text-lg font-semibold">Adicionar Repositórios</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <SelectReposPage projectId={projectId || ''} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Selecione o repositório que deseja visualizar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connection?.connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (projectId && confirm('Tem certeza que deseja desconectar o GitHub? Todos os repositórios selecionados serão desmarcados.')) {
                    await revokeConnection.mutateAsync(projectId);
                  }
                }}
                disabled={revokeConnection.isPending}
              >
                {revokeConnection.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  <>
                    <LogOut className="h-4 w-4 mr-2" />
                    Desconectar GitHub
                  </>
                )}
              </Button>
            )}
            {connection?.connected && (
              <Button onClick={() => setShowAddRepos(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Repositórios
              </Button>
            )}
          </div>
        </div>
        
        {/* Informações da conexão GitHub */}
        {connection?.connected && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Github className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Conectado ao GitHub</p>
                    <p className="text-xs text-muted-foreground">
                      Usuário: <strong>{connection.username}</strong>
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-3 w-3 mr-1 text-green-600 dark:text-green-400" />
                  Conectado
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
        
        {!connection?.connected && (
          <Card className="mb-4 border-dashed">
            <CardContent className="p-4 text-center">
              <Github className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Nenhuma conexão GitHub ativa
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/project/${projectId}/code`)}
              >
                Conectar GitHub
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : repos.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Code2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum repositório selecionado</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Adicione repositórios do GitHub para começar a usar o módulo de código
                </p>
                <Button onClick={() => setShowAddRepos(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Repositórios
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {repos.map((repo: any) => {
                  const isActive = activeRepoId === repo.id;
                  
                  return (
                    <Card 
                      key={repo.id} 
                      className={`cursor-pointer transition-all hover:border-primary ${isActive ? 'border-primary bg-primary/5' : ''}`}
                      onClick={() => setActiveRepoId(repo.id)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Code2 className="h-4 w-4 shrink-0" />
                              <span className="truncate">{repo.full_name?.split('/')[1] || repo.full_name}</span>
                            </CardTitle>
                            <CardDescription className="mt-1 truncate">
                              {repo.full_name}
                            </CardDescription>
                          </div>
                          {isActive && (
                            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <GitPullRequest className="h-3 w-3" />
                              <span>{repo.open_prs_count || 0} PRs abertos</span>
                            </div>
                            <Badge variant={repo.visibility === 'private' ? 'secondary' : 'outline'}>
                              {repo.visibility === 'private' ? 'Privado' : 'Público'}
                            </Badge>
                          </div>
                          {repo.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRepoId(repo.id);
                              }}
                            >
                              {isActive ? 'Ativo' : 'Selecionar'}
                            </Button>
                            {repo.url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(repo.url, '_blank');
                                }}
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

