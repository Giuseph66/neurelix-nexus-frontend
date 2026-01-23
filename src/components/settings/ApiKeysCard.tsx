import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  useApiKeys, 
  useCreateApiKey, 
  useUpdateApiKey, 
  useDeleteApiKey, 
  useResetApiKeyErrors,
  type ApiKey,
  type ApiProvider 
} from '@/hooks/useApiKeys';
import { apiFetch } from '@/lib/api';
import { 
  Plus, 
  Key, 
  Trash2, 
  Edit, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertTriangle,
  Sparkles,
  Brain,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Switch } from '@/components/ui/switch';

interface ApiKeysCardProps {
  projectId: string;
}

export function ApiKeysCard({ projectId }: ApiKeysCardProps) {
  const { data: apiKeys, isLoading } = useApiKeys(projectId);
  const createApiKey = useCreateApiKey();
  const updateApiKey = useUpdateApiKey();
  const deleteApiKey = useDeleteApiKey();
  const resetErrors = useResetApiKeyErrors();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);

  const [newProvider, setNewProvider] = useState<ApiProvider>('GEMINI');
  const [newApiKey, setNewApiKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newTimeout, setNewTimeout] = useState(60);
  const [newModelPrimary, setNewModelPrimary] = useState('');
  const [newModelFallback, setNewModelFallback] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [fullKeys, setFullKeys] = useState<Map<string, string>>(new Map());
  const [showInputKey, setShowInputKey] = useState(false);
  const [showEditInputKey, setShowEditInputKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testResults, setTestResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());

  // Modelos disponíveis
  const geminiModels = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recomendado)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Econômico)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Avançado)' },
    { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
    { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (Preview)' },
  ];

  const openaiModels = [
    { value: 'gpt-5.1-chat-latest', label: 'GPT 5.1 Chat (Recomendado)' },
    { value: 'gpt-5.2-chat-latest', label: 'GPT 5.2 Chat (Mais Avançado)' },
    { value: 'gpt-5-chat-latest', label: 'GPT 5 Chat' },
  ];

  const getDefaultModels = (provider: ApiProvider) => {
    if (provider === 'GEMINI') {
      return { primary: 'gemini-2.5-flash', fallback: 'gemini-2.5-flash-lite' };
    }
    return { primary: 'gpt-5.1-chat-latest', fallback: 'gpt-5.2-chat-latest' };
  };

  const toggleKeyVisibility = async (keyId: string) => {
    const isVisible = visibleKeys.has(keyId);
    
    if (!isVisible && !fullKeys.has(keyId)) {
      // Buscar chave completa do backend
      try {
        const data = await apiFetch<{ api_key: string }>(`/api-keys/${keyId}/key`, { auth: true });
        setFullKeys(prev => new Map(prev).set(keyId, data.api_key));
      } catch (error) {
        console.error('Erro ao buscar chave:', error);
      }
    }
    
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  };

  const handleTestKey = async (key: ApiKey) => {
    setTestingKeyId(key.id);
    setTestResults(prev => {
      const next = new Map(prev);
      next.delete(key.id);
      return next;
    });

    // Buscar chave completa se não estiver carregada
    let apiKey = fullKeys.get(key.id);
    if (!apiKey) {
      try {
        const data = await apiFetch<{ api_key: string }>(`/api-keys/${key.id}/key`, { auth: true });
        apiKey = data.api_key;
        setFullKeys(prev => new Map(prev).set(key.id, apiKey!));
      } catch (error) {
        setTestResults(prev => new Map(prev).set(key.id, {
          success: false,
          message: 'Erro ao buscar chave completa'
        }));
        setTestingKeyId(null);
        return;
      }
    }

    try {
      const result = await apiFetch<{ valid: boolean; message: string }>('/api-keys/test', {
        method: 'POST',
        body: {
          provider: key.provider,
          api_key: apiKey,
          model_primary: key.model_primary || getDefaultModels(key.provider).primary,
        },
        auth: true,
      });
      setTestResults(prev => new Map(prev).set(key.id, {
        success: result.valid,
        message: result.message
      }));
    } catch (error) {
      setTestResults(prev => new Map(prev).set(key.id, {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao testar chave'
      }));
    } finally {
      setTestingKeyId(null);
    }
  };

  const handleCreate = async () => {
    if (!newApiKey.trim()) return;

    const defaults = getDefaultModels(newProvider);
    await createApiKey.mutateAsync({
      project_id: projectId,
      provider: newProvider,
      api_key: newApiKey.trim(),
      name: newName.trim() || undefined,
      timeout_seconds: newTimeout,
      model_primary: newModelPrimary || defaults.primary,
      model_fallback: newModelFallback || defaults.fallback,
    });

    setShowCreateDialog(false);
    setNewApiKey('');
    setNewName('');
    setNewTimeout(60);
    setShowInputKey(false);
    setTestResult(null);
    const defaultModels = getDefaultModels(newProvider);
    setNewModelPrimary(defaultModels.primary);
    setNewModelFallback(defaultModels.fallback);
  };

  const handleEdit = async () => {
    if (!editingKey) return;

    await updateApiKey.mutateAsync({
      keyId: editingKey.id,
      input: {
        api_key: newApiKey.trim() || undefined,
        name: newName.trim() || undefined,
        timeout_seconds: newTimeout,
        model_primary: newModelPrimary || undefined,
        model_fallback: newModelFallback || undefined,
      },
    });

    setShowEditDialog(false);
    setEditingKey(null);
    setNewApiKey('');
    setNewName('');
    setNewTimeout(60);
    setShowEditInputKey(false);
    setTestResult(null);
    setNewModelPrimary('');
    setNewModelFallback('');
  };

  const handleDelete = async () => {
    if (!editingKey) return;
    await deleteApiKey.mutateAsync({
      keyId: editingKey.id,
      projectId: editingKey.project_id,
    });
    setShowDeleteDialog(false);
    setEditingKey(null);
  };

  const handleToggleActive = async (key: ApiKey) => {
    await updateApiKey.mutateAsync({
      keyId: key.id,
      input: {
        is_active: !key.is_active,
      },
    });
  };

  const handleResetErrors = async (key: ApiKey) => {
    await resetErrors.mutateAsync({
      keyId: key.id,
      projectId: key.project_id,
    });
  };

  const openEditDialog = (key: ApiKey) => {
    setEditingKey(key);
    setNewProvider(key.provider);
    setNewApiKey('');
    setNewName(key.name || '');
    setNewTimeout(key.timeout_seconds);
    setNewModelPrimary(key.model_primary || getDefaultModels(key.provider).primary);
    setNewModelFallback(key.model_fallback || getDefaultModels(key.provider).fallback);
    setShowEditDialog(true);
  };

  const openDeleteDialog = (key: ApiKey) => {
    setEditingKey(key);
    setShowDeleteDialog(true);
  };

  const getProviderIcon = (provider: ApiProvider) => {
    return provider === 'GEMINI' ? <Sparkles className="h-4 w-4" /> : <Brain className="h-4 w-4" />;
  };

  const getProviderColor = (provider: ApiProvider) => {
    return provider === 'GEMINI' ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'bg-green-500/10 text-green-700 dark:text-green-400';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Chaves de API</CardTitle>
              <CardDescription>
                Gerencie chaves de API para Gemini e OpenAI com rotação automática
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Chave
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : apiKeys && apiKeys.length > 0 ? (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getProviderColor(key.provider)}>
                          {getProviderIcon(key.provider)}
                          <span className="ml-1">{key.provider}</span>
                        </Badge>
                        {key.name && (
                          <span className="font-medium text-sm">{key.name}</span>
                        )}
                        <Badge variant={key.is_active ? 'default' : 'secondary'}>
                          {key.is_active ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Ativa
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inativa
                            </>
                          )}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Key className="h-3 w-3" />
                          <span className="font-mono text-xs">
                            {visibleKeys.has(key.id) 
                              ? (fullKeys.get(key.id) || key.api_key_preview)
                              : key.api_key_preview}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => toggleKeyVisibility(key.id)}
                            title={visibleKeys.has(key.id) ? 'Ocultar chave' : 'Mostrar chave'}
                          >
                            {visibleKeys.has(key.id) ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Timeout: {key.timeout_seconds}s</span>
                        </div>
                        {key.model_primary && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs">Modelo: {key.model_primary}</span>
                            {key.model_fallback && (
                              <span className="text-xs text-muted-foreground">
                                / {key.model_fallback}
                              </span>
                            )}
                          </div>
                        )}
                        {key.error_count > 0 && (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{key.error_count} erro(s)</span>
                          </div>
                        )}
                      </div>

                      {key.last_used_at && (
                        <p className="text-xs text-muted-foreground">
                          Último uso: {format(new Date(key.last_used_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}

                      {key.last_error_at && (
                        <p className="text-xs text-destructive">
                          Último erro: {format(new Date(key.last_error_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}

                      {testResults.has(key.id) && (
                        <div className={`text-xs p-2 rounded-md mt-2 ${
                          testResults.get(key.id)?.success 
                            ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                            : 'bg-red-500/10 text-red-700 dark:text-red-400'
                        }`}>
                          {testResults.get(key.id)?.message}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`toggle-${key.id}`} className="text-xs">
                          Ativa
                        </Label>
                        <Switch
                          id={`toggle-${key.id}`}
                          checked={key.is_active}
                          onCheckedChange={() => handleToggleActive(key)}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestKey(key)}
                        disabled={testingKeyId === key.id}
                        title="Testar chave de API"
                      >
                        {testingKeyId === key.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                      </Button>
                      {key.error_count > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetErrors(key)}
                          title="Resetar contador de erros"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(key)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(key)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma chave de API cadastrada</p>
              <p className="text-xs mt-2">
                Adicione chaves para habilitar rotação automática
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Chave de API</DialogTitle>
            <DialogDescription>
              Configure uma nova chave de API. O sistema usará rotação automática entre múltiplas chaves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Select value={newProvider} onValueChange={(v) => {
                setNewProvider(v as ApiProvider);
                const defaults = getDefaultModels(v as ApiProvider);
                setNewModelPrimary(defaults.primary);
                setNewModelFallback(defaults.fallback);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GEMINI">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Gemini (Google)
                    </div>
                  </SelectItem>
                  {/*
                  <SelectItem value="OPENAI">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      OpenAI (ChatGPT)
                    </div>
                  </SelectItem>
                      */}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="api-key">Chave de API *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!newApiKey.trim()) {
                      setTestResult({ success: false, message: 'Digite uma chave primeiro' });
                      return;
                    }
                    setTestingKey(true);
                    setTestResult(null);
                    try {
                      const result = await apiFetch<{ valid: boolean; message: string }>('/api-keys/test', {
                        method: 'POST',
                        body: {
                          provider: newProvider,
                          api_key: newApiKey.trim(),
                          model_primary: newModelPrimary || getDefaultModels(newProvider).primary,
                        },
                        auth: true,
                      });
                      setTestResult({ success: result.valid, message: result.message });
                    } catch (error) {
                      setTestResult({ 
                        success: false, 
                        message: error instanceof Error ? error.message : 'Erro ao testar chave' 
                      });
                    } finally {
                      setTestingKey(false);
                    }
                  }}
                  disabled={testingKey || !newApiKey.trim()}
                >
                  {testingKey ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-2" />
                      Testar Chave
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showInputKey ? "text" : "password"}
                  value={newApiKey}
                  onChange={(e) => {
                    setNewApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="sk-... ou AIza..."
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowInputKey(!showInputKey)}
                >
                  {showInputKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {testResult && (
                <div className={`text-xs p-2 rounded-md ${
                  testResult.success 
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                    : 'bg-red-500/10 text-red-700 dark:text-red-400'
                }`}>
                  {testResult.message}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {newProvider === 'GEMINI' 
                  ? 'Obtenha sua chave em: https://makersuite.google.com/app/apikey'
                  : 'Obtenha sua chave em: https://platform.openai.com/api-keys'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome (opcional)</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Chave pessoal, Chave do time..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (segundos)</Label>
              <Input
                id="timeout"
                type="number"
                min="1"
                value={newTimeout}
                onChange={(e) => setNewTimeout(parseInt(e.target.value) || 60)}
              />
              <p className="text-xs text-muted-foreground">
                Tempo de espera antes de considerar timeout (padrão: 60s)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-primary">Modelo Principal</Label>
              <Select
                value={newModelPrimary || getDefaultModels(newProvider).primary}
                onValueChange={setNewModelPrimary}
              >
                <SelectTrigger id="model-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(newProvider === 'GEMINI' ? geminiModels : openaiModels).map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Modelo usado por padrão para esta chave
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model-fallback">Modelo Alternativo</Label>
              <Select
                value={newModelFallback || getDefaultModels(newProvider).fallback}
                onValueChange={setNewModelFallback}
              >
                <SelectTrigger id="model-fallback">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(newProvider === 'GEMINI' ? geminiModels : openaiModels).map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Modelo usado como fallback quando o principal falhar
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!newApiKey.trim() || createApiKey.isPending}>
              {createApiKey.isPending ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Chave de API</DialogTitle>
            <DialogDescription>
              Atualize as informações da chave de API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Provedor</Label>
              <Input value={editingKey?.provider || ''} disabled />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-api-key">Nova Chave de API (deixe em branco para manter)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!newApiKey.trim()) {
                      setTestResult({ success: false, message: 'Digite uma chave primeiro' });
                      return;
                    }
                    setTestingKey(true);
                    setTestResult(null);
                    try {
                      const result = await apiFetch<{ valid: boolean; message: string }>('/api-keys/test', {
                        method: 'POST',
                        body: {
                          provider: editingKey?.provider || 'GEMINI',
                          api_key: newApiKey.trim(),
                          model_primary: newModelPrimary || getDefaultModels(editingKey?.provider || 'GEMINI').primary,
                        },
                        auth: true,
                      });
                      setTestResult({ success: result.valid, message: result.message });
                    } catch (error) {
                      setTestResult({ 
                        success: false, 
                        message: error instanceof Error ? error.message : 'Erro ao testar chave' 
                      });
                    } finally {
                      setTestingKey(false);
                    }
                  }}
                  disabled={testingKey || !newApiKey.trim()}
                >
                  {testingKey ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-2" />
                      Testar Chave
                    </>
                  )}
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="edit-api-key"
                  type={showEditInputKey ? "text" : "password"}
                  value={newApiKey}
                  onChange={(e) => {
                    setNewApiKey(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Deixe em branco para manter a atual"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowEditInputKey(!showEditInputKey)}
                >
                  {showEditInputKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {testResult && (
                <div className={`text-xs p-2 rounded-md ${
                  testResult.success 
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400' 
                    : 'bg-red-500/10 text-red-700 dark:text-red-400'
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Chave pessoal..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-timeout">Timeout (segundos)</Label>
              <Input
                id="edit-timeout"
                type="number"
                min="1"
                value={newTimeout}
                onChange={(e) => setNewTimeout(parseInt(e.target.value) || 60)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-model-primary">Modelo Principal</Label>
              <Select
                value={newModelPrimary || getDefaultModels(editingKey?.provider || 'GEMINI').primary}
                onValueChange={setNewModelPrimary}
              >
                <SelectTrigger id="edit-model-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {((editingKey?.provider || 'GEMINI') === 'GEMINI' ? geminiModels : openaiModels).map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-model-fallback">Modelo Alternativo</Label>
              <Select
                value={newModelFallback || getDefaultModels(editingKey?.provider || 'GEMINI').fallback}
                onValueChange={setNewModelFallback}
              >
                <SelectTrigger id="edit-model-fallback">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {((editingKey?.provider || 'GEMINI') === 'GEMINI' ? geminiModels : openaiModels).map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={updateApiKey.isPending}>
              {updateApiKey.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Chave de API</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta chave de API? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteApiKey.isPending}
            >
              {deleteApiKey.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

