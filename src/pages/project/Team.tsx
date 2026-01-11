import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Plus, Loader2, MoreHorizontal, UserMinus, Shield, X, Mail, Clock, Settings } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useCreateInvite, useProjectInvites, useDeleteInvite } from "@/hooks/useProjectInvites";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getRoleLabel, getRoleBadgeVariant, type AppRole } from "@/lib/roles";
import { useNavigate } from "react-router-dom";
import { useCustomRoles } from "@/hooks/useRolePermissions";

interface ProjectMember {
  id: string;
  role: AppRole;
  user_id: string;
  created_at: string;
  custom_role_name?: string | null;
  profiles: {
    id?: string;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export default function Team() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInvitesModalOpen, setIsInvitesModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole | 'custom'>("developer");
  const [inviteCustomRoleName, setInviteCustomRoleName] = useState<string | null>(null);

  // Hooks para convites
  const { data: invitesData } = useProjectInvites(projectId || undefined);
  const createInviteMutation = useCreateInvite();
  const deleteInviteMutation = useDeleteInvite();

  const { data: currentUserRole } = useQuery({
    queryKey: ["project-role", projectId],
    queryFn: async () => {
      if (!projectId || !user) return null;
      const data = await apiFetch<{ role: AppRole }>(`/projects/${projectId}/role`, { auth: true });
      return data.role;
    },
    enabled: !!projectId && !!user,
  });

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch(`/projects/${projectId}`, { auth: true });
    },
    enabled: !!projectId,
  });

  const { data: membersData, isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      if (!projectId) return { members: [] };
      return await apiFetch<{ members: ProjectMember[] }>(`/projects/${projectId}/members`, { auth: true });
    },
    enabled: !!projectId,
  });

  const { data: customRolesData } = useCustomRoles(projectId || undefined);
  const customRoles = customRolesData?.roles || [];

  const members = membersData?.members || [];

  usePageTitle("Equipe", project?.name);

  const updateRoleMutation = useMutation({
    mutationFn: async ({ 
      memberId, 
      newRole, 
      customRoleName 
    }: { 
      memberId: string; 
      newRole: AppRole | 'custom';
      customRoleName?: string | null;
    }) => {
      await apiFetch(`/projects/${projectId}/members/${memberId}`, {
        method: 'PUT',
        body: { 
          role: newRole,
          custom_role_name: newRole === 'custom' ? customRoleName : null,
        },
        auth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast({ title: "Papel atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar papel",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      await apiFetch(`/projects/${projectId}/members/${memberId}`, {
        method: 'DELETE',
        auth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast({ title: "Membro removido com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover membro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canManageMembers = currentUserRole === "admin" || currentUserRole === "tech_lead";
  const canInvite = canManageMembers;

  const handleInvite = async () => {
    if (!projectId || !inviteEmail.trim()) return;
    if (inviteRole === 'custom' && !inviteCustomRoleName) {
      toast({
        title: "Erro",
        description: "Selecione um role personalizado",
        variant: "destructive",
      });
      return;
    }

    createInviteMutation.mutate(
      {
        projectId,
        email: inviteEmail.trim(),
        role: inviteRole === 'custom' ? 'custom' : inviteRole,
        custom_role_name: inviteRole === 'custom' ? inviteCustomRoleName : undefined,
      },
      {
        onSuccess: () => {
          setInviteEmail("");
          setInviteRole("developer");
          setInviteCustomRoleName(null);
          setIsInviteOpen(false);
        },
      }
    );
  };


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground">
            Gerencie os membros e permissões do projeto
          </p>
        </div>

        {canInvite && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/project/${projectId}/team/roles`)}
            >
              <Settings className="mr-2 h-4 w-4" />
              Configurar Roles
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsInvitesModalOpen(true)}
            >
              <Mail className="mr-2 h-4 w-4" />
              Ver convites
            </Button>
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Convidar membro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar membro</DialogTitle>
                  <DialogDescription>
                    Envie um convite por email para adicionar um novo membro ao projeto
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="membro@email.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && inviteEmail.trim()) {
                          handleInvite();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Papel</Label>
                    <Select 
                      value={inviteRole} 
                      onValueChange={(v) => {
                        setInviteRole(v as AppRole | 'custom');
                        if (v !== 'custom') {
                          setInviteCustomRoleName(null);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{getRoleLabel("admin")}</SelectItem>
                        <SelectItem value="tech_lead">{getRoleLabel("tech_lead")}</SelectItem>
                        <SelectItem value="developer">{getRoleLabel("developer")}</SelectItem>
                        <SelectItem value="viewer">{getRoleLabel("viewer")}</SelectItem>
                        {customRoles.length > 0 && (
                          <>
                            <SelectItem value="custom" className="font-medium">
                              Personalizado
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {inviteRole === 'custom' && (
                      <Select
                        value={inviteCustomRoleName || ''}
                        onValueChange={(v) => setInviteCustomRoleName(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um role personalizado" />
                        </SelectTrigger>
                        <SelectContent>
                          {customRoles.map((role) => (
                            <SelectItem key={role.id} value={role.role_name}>
                              {role.role_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || createInviteMutation.isPending || (inviteRole === 'custom' && !inviteCustomRoleName)}
                  >
                    {createInviteMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Enviar convite
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Modal de convites ativos para copiar link */}
      {canInvite && (
        <Dialog open={isInvitesModalOpen} onOpenChange={setIsInvitesModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convites ativos</DialogTitle>
              <DialogDescription>
                Veja todos os convites pendentes e copie o link de convite para compartilhar.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 max-h-[400px] overflow-y-auto space-y-3">
              {invitesData?.invites && invitesData.invites.length > 0 ? (
                invitesData.invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{invite.email}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {invite.role === 'custom' && invite.custom_role_name
                              ? invite.custom_role_name
                              : getRoleLabel(invite.role)}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(invite.expires_at), {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const origin = window.location.origin;
                            const acceptUrl = `${origin}/auth/accept-invite?token=${invite.token}`;
                            await navigator.clipboard.writeText(acceptUrl);
                            toast({
                              title: "Link copiado",
                              description: "O link do convite foi copiado para a área de transferência.",
                            });
                          } catch (error) {
                            console.error("Erro ao copiar link:", error);
                            toast({
                              title: "Erro ao copiar link",
                              description: "Não foi possível copiar o link do convite.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Copiar link
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          deleteInviteMutation.mutate({
                            inviteId: invite.id,
                            projectId: projectId!,
                          })
                        }
                        disabled={deleteInviteMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum convite ativo no momento.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Convites Pendentes */}
      {canInvite && invitesData?.invites && invitesData.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convites Pendentes</CardTitle>
            <CardDescription>
              {invitesData.invites.length} convite{invitesData.invites.length !== 1 ? "s" : ""} aguardando aceitação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitesData.invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{invite.email}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {getRoleLabel(invite.role)}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(invite.expires_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      deleteInviteMutation.mutate({
                        inviteId: invite.id,
                        projectId: projectId!,
                      })
                    }
                    disabled={deleteInviteMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros do projeto</CardTitle>
          <CardDescription>
            {members?.length || 0} membro{members?.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Desde</TableHead>
                  {canManageMembers && <TableHead className="w-[50px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members?.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {member.profiles?.full_name?.[0]?.toUpperCase() || "U"}
                        </div>
                        <span>{member.profiles?.full_name || "Usuário"}</span>
                        {member.user_id === user?.id && (
                          <Badge variant="outline" className="text-2xs">
                            Você
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {member.role === 'custom' && member.custom_role_name
                          ? member.custom_role_name
                          : getRoleLabel(member.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    {canManageMembers && (
                      <TableCell>
                        {member.user_id !== user?.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  updateRoleMutation.mutate({
                                    memberId: member.id,
                                    newRole: "admin",
                                  })
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Tornar {getRoleLabel("admin")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  updateRoleMutation.mutate({
                                    memberId: member.id,
                                    newRole: "tech_lead",
                                  })
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Tornar {getRoleLabel("tech_lead")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  updateRoleMutation.mutate({
                                    memberId: member.id,
                                    newRole: "developer",
                                  })
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Tornar {getRoleLabel("developer")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  updateRoleMutation.mutate({
                                    memberId: member.id,
                                    newRole: "viewer",
                                  })
                                }
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Tornar {getRoleLabel("viewer")}
                              </DropdownMenuItem>
                              {customRoles.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  {customRoles.map((customRole) => (
                                    <DropdownMenuItem
                                      key={customRole.id}
                                      onClick={() =>
                                        updateRoleMutation.mutate({
                                          memberId: member.id,
                                          newRole: 'custom',
                                          customRoleName: customRole.role_name,
                                        })
                                      }
                                    >
                                      <Shield className="mr-2 h-4 w-4" />
                                      {customRole.role_name}
                                    </DropdownMenuItem>
                                  ))}
                                </>
                              )}
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => removeMemberMutation.mutate(member.id)}
                              >
                                <UserMinus className="mr-2 h-4 w-4" />
                                Remover
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
