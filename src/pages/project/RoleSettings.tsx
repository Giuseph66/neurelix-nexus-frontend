import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Loader2,
  Trash2,
  Edit,
  Save,
  X,
  Copy,
  Settings,
  CheckSquare,
  Square,
  Info,
  Shield,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import {
  useCustomRoles,
  useCreateCustomRole,
  useUpdateCustomRole,
  useDeleteCustomRole,
  type CustomRole,
} from '@/hooks/useRolePermissions';
import { getRoleLabel, getRoleDescription, getRoleBadgeVariant, type AppRole } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type PermissionModule = 'dashboard' | 'whiteboard' | 'tarefas' | 'code' | 'team' | 'settings';

interface PermissionConfig {
  module: PermissionModule;
  label: string;
  permissions: {
    key: string;
    label: string;
  }[];
}

const PERMISSION_MODULES: PermissionConfig[] = [
  {
    module: 'dashboard',
    label: 'Dashboard',
    permissions: [{ key: 'visualizar', label: 'Visualizar' }],
  },
  {
    module: 'whiteboard',
    label: 'Quadro Branco',
    permissions: [
      { key: 'visualizar', label: 'Visualizar' },
      { key: 'criar', label: 'Criar' },
      { key: 'editar', label: 'Editar' },
      { key: 'deletar', label: 'Deletar' },
      { key: 'comentar', label: 'Comentar' },
    ],
  },
  {
    module: 'tarefas',
    label: 'Tarefas',
    permissions: [
      { key: 'visualizar', label: 'Visualizar' },
      { key: 'criar', label: 'Criar' },
      { key: 'editar', label: 'Editar' },
      { key: 'deletar', label: 'Deletar' },
      { key: 'mover', label: 'Mover' },
      { key: 'comentar', label: 'Comentar' },
      { key: 'gerenciar_sprints', label: 'Gerenciar Sprints' },
      { key: 'gerenciar_epics', label: 'Gerenciar Epics' },
    ],
  },
  {
    module: 'code',
    label: 'Código',
    permissions: [
      { key: 'visualizar', label: 'Visualizar' },
      { key: 'conectar_github', label: 'Conectar GitHub' },
      { key: 'criar_pr', label: 'Criar Pull Request' },
      { key: 'revisar_pr', label: 'Revisar Pull Request' },
      { key: 'mesclar_pr', label: 'Mesclar Pull Request' },
      { key: 'comentar_pr', label: 'Comentar em PR' },
    ],
  },
  {
    module: 'team',
    label: 'Equipe',
    permissions: [
      { key: 'visualizar', label: 'Visualizar' },
      { key: 'convidar', label: 'Convidar Membros' },
      { key: 'editar_roles', label: 'Editar Roles' },
      { key: 'remover_membros', label: 'Remover Membros' },
    ],
  },
  {
    module: 'settings',
    label: 'Configurações',
    permissions: [
      { key: 'visualizar', label: 'Visualizar' },
      { key: 'editar_projeto', label: 'Editar Projeto' },
      { key: 'deletar_projeto', label: 'Deletar Projeto' },
    ],
  },
];

export default function RoleSettings() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const { data: rolesData, isLoading } = useCustomRoles(projectId || undefined);
  const createMutation = useCreateCustomRole();
  const updateMutation = useUpdateCustomRole();
  const deleteMutation = useDeleteCustomRole();

  const { data: project } = useQuery<{ name?: string }>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch<{ name?: string }>(`/projects/${projectId}`, { auth: true });
    },
    enabled: !!projectId,
  });

  usePageTitle('Configurar Roles', project?.name);

  const roles = rolesData?.roles || [];

  // Permissões pré-configuradas dos roles padrão
  const defaultRolePermissions: Record<AppRole, Record<string, boolean>> = {
    admin: {
      'dashboard.visualizar': true,
      'whiteboard.visualizar': true,
      'whiteboard.criar': true,
      'whiteboard.editar': true,
      'whiteboard.deletar': true,
      'whiteboard.comentar': true,
      'tarefas.visualizar': true,
      'tarefas.criar': true,
      'tarefas.editar': true,
      'tarefas.deletar': true,
      'tarefas.mover': true,
      'tarefas.comentar': true,
      'tarefas.gerenciar_sprints': true,
      'tarefas.gerenciar_epics': true,
      'code.visualizar': true,
      'code.conectar_github': true,
      'code.criar_pr': true,
      'code.revisar_pr': true,
      'code.mesclar_pr': true,
      'code.comentar_pr': true,
      'team.visualizar': true,
      'team.convidar': true,
      'team.editar_roles': true,
      'team.remover_membros': true,
      'settings.visualizar': true,
      'settings.editar_projeto': true,
      'settings.deletar_projeto': true,
    },
    tech_lead: {
      'dashboard.visualizar': true,
      'whiteboard.visualizar': true,
      'whiteboard.criar': true,
      'whiteboard.editar': true,
      'whiteboard.deletar': true,
      'whiteboard.comentar': true,
      'tarefas.visualizar': true,
      'tarefas.criar': true,
      'tarefas.editar': true,
      'tarefas.deletar': true,
      'tarefas.mover': true,
      'tarefas.comentar': true,
      'tarefas.gerenciar_sprints': true,
      'tarefas.gerenciar_epics': true,
      'code.visualizar': true,
      'code.conectar_github': true,
      'code.criar_pr': true,
      'code.revisar_pr': true,
      'code.mesclar_pr': true,
      'code.comentar_pr': true,
      'team.visualizar': true,
      'team.convidar': true,
      'team.editar_roles': true,
      'team.remover_membros': true,
      'settings.visualizar': true,
      'settings.editar_projeto': true,
      'settings.deletar_projeto': false,
    },
    developer: {
      'dashboard.visualizar': true,
      'whiteboard.visualizar': true,
      'whiteboard.criar': true,
      'whiteboard.editar': true,
      'whiteboard.deletar': false,
      'whiteboard.comentar': true,
      'tarefas.visualizar': true,
      'tarefas.criar': true,
      'tarefas.editar': true,
      'tarefas.deletar': false,
      'tarefas.mover': true,
      'tarefas.comentar': true,
      'tarefas.gerenciar_sprints': false,
      'tarefas.gerenciar_epics': false,
      'code.visualizar': true,
      'code.conectar_github': false,
      'code.criar_pr': true,
      'code.revisar_pr': true,
      'code.mesclar_pr': false,
      'code.comentar_pr': true,
      'team.visualizar': true,
      'team.convidar': false,
      'team.editar_roles': false,
      'team.remover_membros': false,
      'settings.visualizar': true,
      'settings.editar_projeto': false,
      'settings.deletar_projeto': false,
    },
    viewer: {
      'dashboard.visualizar': true,
      'whiteboard.visualizar': true,
      'whiteboard.criar': false,
      'whiteboard.editar': false,
      'whiteboard.deletar': false,
      'whiteboard.comentar': false,
      'tarefas.visualizar': true,
      'tarefas.criar': false,
      'tarefas.editar': false,
      'tarefas.deletar': false,
      'tarefas.mover': false,
      'tarefas.comentar': false,
      'tarefas.gerenciar_sprints': false,
      'tarefas.gerenciar_epics': false,
      'code.visualizar': true,
      'code.conectar_github': false,
      'code.criar_pr': false,
      'code.revisar_pr': false,
      'code.mesclar_pr': false,
      'code.comentar_pr': false,
      'team.visualizar': true,
      'team.convidar': false,
      'team.editar_roles': false,
      'team.remover_membros': false,
      'settings.visualizar': false,
      'settings.editar_projeto': false,
      'settings.deletar_projeto': false,
    },
    custom: {},
  };

  const defaultRoles: AppRole[] = ['admin', 'tech_lead', 'developer', 'viewer'];

  const renderDefaultRoleInfo = (role: AppRole) => {
    const rolePermissions = defaultRolePermissions[role];
    const activeCount = Object.values(rolePermissions).filter((v) => v === true).length;
    const totalCount = Object.keys(rolePermissions).length;

    return (
      <AccordionItem key={role} value={role}>
        <div className="flex items-center gap-2 pr-2">
          <AccordionTrigger className="hover:no-underline flex-1">
            <div className="flex items-center gap-3 flex-1">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <Badge variant={getRoleBadgeVariant(role)}>{getRoleLabel(role)}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {activeCount} / {totalCount} permissões
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{getRoleDescription(role)}</p>
              </div>
            </div>
          </AccordionTrigger>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicateDefaultRole(role);
            }}
            className="h-8 w-8 flex-shrink-0"
            title="Criar role personalizado baseado neste"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <AccordionContent>
          <div className="pt-2 space-y-4">
            {PERMISSION_MODULES.map((moduleConfig) => {
              const modulePerms = moduleConfig.permissions.map((p) => `${moduleConfig.module}.${p.key}`);
              const moduleActiveCount = modulePerms.filter((key) => rolePermissions[key] === true).length;

              if (moduleActiveCount === 0) return null;

              return (
                <div key={moduleConfig.module} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{moduleConfig.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {moduleActiveCount} / {modulePerms.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {moduleConfig.permissions.map((perm) => {
                      const permissionKey = `${moduleConfig.module}.${perm.key}`;
                      const hasPermission = rolePermissions[permissionKey] === true;

                      return (
                        <div
                          key={permissionKey}
                          className={cn(
                            'flex items-center gap-2 text-xs',
                            hasPermission ? 'text-foreground' : 'text-muted-foreground opacity-50'
                          )}
                        >
                          {hasPermission ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <X className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>{perm.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const handleCreateRole = () => {
    if (!projectId || !newRoleName.trim()) return;

    createMutation.mutate(
      {
        projectId,
        role_name: newRoleName.trim(),
        permissions,
      },
      {
        onSuccess: () => {
          setNewRoleName('');
          setPermissions({});
          setIsCreateDialogOpen(false);
        },
      }
    );
  };

  const handleEditRole = (role: CustomRole) => {
    setEditingRole(role);
    setPermissions(role.permissions);
  };

  const handleSaveEdit = () => {
    if (!projectId || !editingRole) return;

    updateMutation.mutate(
      {
        projectId,
        roleName: editingRole.role_name,
        permissions,
      },
      {
        onSuccess: () => {
          setEditingRole(null);
          setPermissions({});
        },
      }
    );
  };

  const handleDeleteRole = (role: CustomRole) => {
    if (!projectId) return;

    if (confirm(`Tem certeza que deseja deletar o role "${role.role_name}"?`)) {
      deleteMutation.mutate({
        projectId,
        roleName: role.role_name,
      });
    }
  };

  const handleDuplicateRole = (role: CustomRole) => {
    setNewRoleName(`${role.role_name} (cópia)`);
    setPermissions(role.permissions);
    setIsCreateDialogOpen(true);
  };

  const handleDuplicateDefaultRole = (role: AppRole) => {
    const rolePermissions = defaultRolePermissions[role];
    setNewRoleName(`${getRoleLabel(role)} (cópia)`);
    setPermissions(rolePermissions);
    setIsCreateDialogOpen(true);
  };

  const togglePermission = (permissionKey: string) => {
    setPermissions((prev) => ({
      ...prev,
      [permissionKey]: !prev[permissionKey],
    }));
  };

  const toggleModulePermissions = (module: PermissionModule, value: boolean) => {
    const moduleConfig = PERMISSION_MODULES.find((m) => m.module === module);
    if (!moduleConfig) return;

    const newPermissions = { ...permissions };
    moduleConfig.permissions.forEach((perm) => {
      newPermissions[`${module}.${perm.key}`] = value;
    });
    setPermissions(newPermissions);
  };

  const getModuleCheckedState = (module: PermissionModule): 'all' | 'some' | 'none' => {
    const moduleConfig = PERMISSION_MODULES.find((m) => m.module === module);
    if (!moduleConfig) return 'none';

    const modulePerms = moduleConfig.permissions.map((p) => `${module}.${p.key}`);
    const checkedCount = modulePerms.filter((key) => permissions[key] === true).length;

    if (checkedCount === 0) return 'none';
    if (checkedCount === modulePerms.length) return 'all';
    return 'some';
  };

  const renderPermissionEditor = () => {
    return (
      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-6">
          {PERMISSION_MODULES.map((moduleConfig) => {
            const moduleState = getModuleCheckedState(moduleConfig.module);
            const isAllChecked = moduleState === 'all';
            const isSomeChecked = moduleState === 'some';

            return (
              <Card key={moduleConfig.module}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{moduleConfig.label}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleModulePermissions(moduleConfig.module, !isAllChecked)}
                      className="h-7"
                    >
                      {isAllChecked ? (
                        <CheckSquare className="h-4 w-4 mr-1" />
                      ) : isSomeChecked ? (
                        <Square className="h-4 w-4 mr-1" />
                      ) : (
                        <Square className="h-4 w-4 mr-1" />
                      )}
                      {isAllChecked ? 'Desmarcar todas' : 'Marcar todas'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {moduleConfig.permissions.map((perm) => {
                      const permissionKey = `${moduleConfig.module}.${perm.key}`;
                      const isChecked = permissions[permissionKey] === true;

                      return (
                        <label
                          key={permissionKey}
                          className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded-md"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(permissionKey)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span className="text-sm">{perm.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/project/${projectId}/team`)}
            className="h-9 w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configurar Roles</h1>
            <p className="text-muted-foreground">
              Gerencie roles personalizados e suas permissões no projeto
            </p>
          </div>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Criar Role Personalizado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Criar Role Personalizado</DialogTitle>
              <DialogDescription>
                Defina um nome e configure as permissões para este role
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Nome do Role</Label>
                <Input
                  id="role-name"
                  placeholder="Ex: Gerente de Projeto"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Permissões</Label>
                {renderPermissionEditor()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateRole}
                disabled={!newRoleName.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Criar Role
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Informações dos Roles Pré-configurados */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Roles Pré-configurados</CardTitle>
          </div>
          <CardDescription>
            Estes são os roles padrão do sistema. Eles não podem ser editados, mas você pode visualizar suas permissões
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {defaultRoles.map((role) => renderDefaultRoleInfo(role))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Lista de Roles Customizados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles Personalizados</CardTitle>
          <CardDescription>
            {roles.length} role{roles.length !== 1 ? 's' : ''} personalizado{roles.length !== 1 ? 's' : ''} configurado{roles.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Settings className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">Nenhum role personalizado criado ainda</p>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro role personalizado para começar
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Permissões Ativas</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-[150px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => {
                  const activePermissionsCount = Object.values(role.permissions).filter(
                    (v) => v === true
                  ).length;
                  const totalPermissionsCount = Object.keys(role.permissions).length;

                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.role_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {activePermissionsCount} / {totalPermissionsCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(role.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditRole(role)}
                            className="h-8 w-8"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicateRole(role)}
                            className="h-8 w-8"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRole(role)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Edição */}
      {editingRole && (
        <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Editar Role: {editingRole.role_name}</DialogTitle>
              <DialogDescription>
                Atualize as permissões para este role personalizado
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role-name">Nome do Role</Label>
                <Input
                  id="edit-role-name"
                  value={editingRole.role_name}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O nome do role não pode ser alterado após a criação
                </p>
              </div>
              <div className="space-y-2">
                <Label>Permissões</Label>
                {renderPermissionEditor()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingRole(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

