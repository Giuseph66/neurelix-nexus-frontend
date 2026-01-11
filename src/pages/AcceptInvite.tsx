import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertCircle, Mail, Eye, EyeOff } from 'lucide-react';
import { useAcceptInvite } from '@/hooks/useProjectInvites';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, signUp, signIn } = useAuth();
  const token = searchParams.get('token');
  const acceptInviteMutation = useAcceptInvite();
  const acceptedProjectId =
    acceptInviteMutation.data && !acceptInviteMutation.data.requiresAuth ? acceptInviteMutation.data.project_id : null;

  const [isSigningUp, setIsSigningUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  usePageTitle('Aceitar Convite');

  // Buscar informações do convite (especialmente o email) para exibir como label
  useEffect(() => {
    if (!token) return;

    const fetchInviteInfo = async () => {
      try {
        // Usa o endpoint público (sem auth) para obter infos do convite
        const res = await apiFetch<{ invite?: { email: string; expires_at: string; accepted_at: string | null }; requiresAuth?: boolean }>(
          `/functions/v1/project-invites/accept/${token}`,
          { method: 'POST', auth: false }
        );

        const invite = res.invite;
        if (!invite?.email || !invite.expires_at) {
          setError('Convite inválido ou expirado');
          setInviteEmail(null);
          return;
        }

        const expired = new Date(invite.expires_at) < new Date();
        if (expired || invite.accepted_at) {
          setError('Convite inválido ou expirado');
          setInviteEmail(null);
          return;
        }

        setInviteEmail(invite.email);
        setEmail(invite.email);
      } catch (e) {
        console.error('Erro ao carregar informações do convite:', e);
        setError('Erro ao carregar informações do convite');
      }
    };

    // Só buscar info se usuário ainda não está logado (para evitar aceitar direto duas vezes)
    if (!user) {
      fetchInviteInfo();
    }
  }, [token, user]);

  useEffect(() => {
    if (token && user) {
      // Se usuário já está logado, tentar aceitar o convite
      handleAcceptInvite();
    }
  }, [token, user]);

  const handleAcceptInvite = async () => {
    if (!token) {
      setError('Token de convite não encontrado');
      return;
    }

    acceptInviteMutation.mutate(token, {
      onSuccess: (data) => {
        if (data.requiresAuth) {
          // Precisa estar logado (ou o token não foi enviado)
          setError('Faça login para aceitar o convite.');
          return;
        }
        // Redirecionar para o projeto
        setTimeout(() => {
          navigate(`/project/${data.project_id}`);
        }, 1500);
      },
    });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !fullName) {
      setError('Preencha todos os campos');
      return;
    }

    setIsSigningUp(true);
    const { error: signUpError } = await signUp(email, password, fullName);
    setIsSigningUp(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    // Após signup bem-sucedido, tentar aceitar o convite
    setTimeout(() => {
      handleAcceptInvite();
    }, 1000);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Preencha email e senha');
      return;
    }

    setIsSigningUp(true);
    const { error: signInError } = await signIn(email, password);
    setIsSigningUp(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    // Após login bem-sucedido, tentar aceitar o convite
    setTimeout(() => {
      handleAcceptInvite();
    }, 1000);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Convite Inválido</CardTitle>
            <CardDescription>
              O link de convite não contém um token válido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/auth')} className="w-full">
              Ir para Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se usuário já está logado e convite foi aceito (de verdade)
  if (user && acceptedProjectId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Convite Aceito!
            </CardTitle>
            <CardDescription>
              Você foi adicionado ao projeto com sucesso. Redirecionando...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Se usuário está logado, mostrar botão para aceitar
  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Aceitar Convite</CardTitle>
            <CardDescription>
              Você foi convidado para participar de um projeto
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {acceptInviteMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {acceptInviteMutation.error?.message || 'Erro ao aceitar convite'}
                </AlertDescription>
              </Alert>
            )}
            <Button
              onClick={handleAcceptInvite}
              disabled={acceptInviteMutation.isPending}
              className="w-full"
            >
              {acceptInviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Aceitando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Aceitar Convite
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Se usuário não está logado, mostrar formulário de registro/login
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Aceitar Convite
          </CardTitle>
          <CardDescription>
            Você foi convidado para participar de um projeto. Crie uma conta ou faça login para aceitar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Formulário de Registro */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Criar Conta</h3>
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Seu nome"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email do convite</Label>
                  <div className="text-sm font-medium">
                    {inviteEmail || 'Convite inválido ou sem email associado'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showSignupPassword ? 'text' : 'password'}
                      placeholder="Mínimo 6 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                      onClick={() => setShowSignupPassword((prev) => !prev)}
                    >
                      {showSignupPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={isSigningUp} className="w-full">
                  {isSigningUp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Criando conta...
                    </>
                  ) : (
                    'Criar Conta e Aceitar Convite'
                  )}
                </Button>
              </form>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Ou</span>
              </div>
            </div>

            {/* Formulário de Login */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Já tem uma conta?</h3>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email do convite</Label>
                  <div className="text-sm font-medium">
                    {inviteEmail || 'Convite inválido ou sem email associado'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loginPassword">Senha</Label>
                  <div className="relative">
                    <Input
                      id="loginPassword"
                      type={showLoginPassword ? 'text' : 'password'}
                      placeholder="Sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                    >
                      {showLoginPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isSigningUp} variant="outline" className="w-full">
                  {isSigningUp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    'Fazer Login e Aceitar Convite'
                  )}
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

