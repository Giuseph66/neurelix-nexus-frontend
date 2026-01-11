import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";

type AppRole = "admin" | "tech_lead" | "developer" | "viewer";

export default function Settings() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: currentUserRole } = useQuery({
    queryKey: ["project-role", projectId],
    queryFn: async () => {
      if (!projectId || !user) return null;
      const data = await apiFetch<{ role: AppRole }>(`/projects/${projectId}/role`, { auth: true });
      return data.role;
    },
    enabled: !!projectId && !!user,
  });

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await apiFetch<any>(`/projects/${projectId}`, { auth: true });
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project) {
      setName(project.name || "");
      setDescription(project.description || "");
    }
  }, [project]);

  usePageTitle("Configurações", project?.name);

  const updateProjectMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      if (!projectId) throw new Error("projectId missing");
      await apiFetch(`/projects/${projectId}`, {
        method: "PUT",
        body: { name, description },
        auth: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Projeto atualizado com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar projeto",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("projectId missing");
      await apiFetch(`/projects/${projectId}`, { method: "DELETE", auth: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Projeto excluído com sucesso" });
      navigate("/projects");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir projeto",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canEdit = currentUserRole === "admin" || currentUserRole === "tech_lead";
  const canDelete = currentUserRole === "admin";

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProjectMutation.mutate({ name: name.trim(), description: description.trim() });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie as configurações do projeto
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações do projeto</CardTitle>
          <CardDescription>Dados básicos do projeto</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do projeto</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit || updateProjectMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit || updateProjectMutation.isPending}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={project?.slug || ""} disabled />
              <p className="text-xs text-muted-foreground">
                O slug não pode ser alterado
              </p>
            </div>
            {canEdit && (
              <Button
                type="submit"
                disabled={updateProjectMutation.isPending || !name.trim()}
              >
                {updateProjectMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar alterações
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {canDelete && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Zona de perigo</CardTitle>
            <CardDescription>
              Ações irreversíveis para o projeto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir projeto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Isso excluirá permanentemente o
                    projeto "{project?.name}" e todos os dados associados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteProjectMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteProjectMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
