import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, AlertCircle, Mail, Eye, EyeOff, ChevronRight, Sparkles, UserPlus, Key } from 'lucide-react';
import { useAcceptInvite } from '@/hooks/useProjectInvites';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, signIn, signUp } = useAuth();
  const token = searchParams.get('token');
  const acceptInviteMutation = useAcceptInvite();
  const acceptedProjectId =
    acceptInviteMutation.data && !acceptInviteMutation.data.requiresAuth ? acceptInviteMutation.data.project_id : null;

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  usePageTitle('Aceitar Convite - NEURELIX NEXUS');

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
          setError('Este convite já foi aceito ou expirou.');
          setInviteEmail(null);
          return;
        }

        setInviteEmail(invite.email);
        setEmail(invite.email);
      } catch (e: any) {
        console.error('Erro ao carregar informações do convite:', e);
        if (e.message?.includes('already been accepted')) {
          setError('Este convite já foi aceito anteriormente.');
        } else {
          setError('Convite inválido ou expirado. Entre em contato com quem te convidou.');
        }
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

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Preencha email e senha');
      return;
    }

    setIsLoading(true);
    const { error: signInError } = await signIn(email, password);
    setIsLoading(false);

    if (signInError) {
      setError('Credenciais incorretas ou erro na conexão.');
      return;
    }

    // Após login bem-sucedido, tentar aceitar o convite (useEffect fará isso)
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || !fullName) {
      setError('Preencha todos os campos');
      return;
    }

    setIsLoading(true);
    const { error: signUpError } = await signUp(email, password, fullName);
    setIsLoading(false);

    if (signUpError) {
      const errorMessage = signUpError.message.includes("already registered") || signUpError.message.includes("User already exists")
        ? "Este e-mail já possui uma conta ativa. Por favor, utilize a aba 'Já Tenho Conta'."
        : signUpError.message;
      
      setError(errorMessage);
      return;
    }

    // Após signup bem-sucedido, tentar aceitar o convite (useEffect fará isso)
  };

  // Se houve erro ao carregar o convite (já aceito, expirado ou inválido)
  if (error && !inviteEmail && !user) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center p-6 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-white/[0.02] blur-[120px] pointer-events-none" />
        <Card className="w-full max-w-[440px] border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-2xl border border-white/10 z-10">
          <div className="p-10 lg:p-12 text-center">
            <div className="flex justify-center mb-8">
              <div className="p-6 rounded-3xl bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="h-12 w-12 text-amber-500" />
              </div>
            </div>
            <h2 className="text-3xl font-black mb-4 tracking-tighter uppercase leading-tight">Aviso do <br />Protocolo</h2>
            <p className="text-gray-500 text-base lg:text-lg mb-8 leading-relaxed font-medium">
              {error}
            </p>
            <Button onClick={() => navigate('/auth')} className="w-full h-14 text-lg font-bold rounded-2xl bg-white text-black hover:bg-white/90 transition-all active:scale-[0.98]">
              IR PARA LOGIN
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center p-6 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-white/[0.02] blur-[120px] pointer-events-none" />
        <Card className="w-full max-w-[440px] border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-2xl border border-white/10 z-10">
          <div className="p-10 lg:p-12 text-center">
            <div className="flex justify-center mb-8">
              <div className="p-6 rounded-3xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
            </div>
            <h2 className="text-3xl font-black mb-4 tracking-tighter uppercase leading-tight">Convite <br />Inválido</h2>
            <p className="text-gray-500 text-base lg:text-lg mb-8 leading-relaxed font-medium">
              Infelizmente este protocolo de convite não é mais válido ou já expirou.
            </p>
            <Button onClick={() => navigate('/auth')} className="w-full h-14 text-lg font-bold rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all active:scale-[0.98]">
              VOLTAR
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (user && acceptedProjectId) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center p-6 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-white/[0.05] blur-[120px] pointer-events-none" />
        <Card className="w-full max-w-[440px] border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-2xl border border-white/10 z-10">
          <div className="p-10 lg:p-12 text-center">
            <div className="flex justify-center mb-8">
              <div className="p-6 rounded-3xl bg-white/10 border border-white/20">
                <CheckCircle2 className="h-12 w-12 text-white animate-pulse" />
              </div>
            </div>
            <h2 className="text-3xl font-black mb-4 tracking-tighter uppercase leading-tight">ACESSO <br />CONCLUÍDO</h2>
            <p className="text-gray-500 text-base lg:text-lg mb-8 leading-relaxed font-medium uppercase tracking-tight">
              Você foi integrado ao Nexus com sucesso.
            </p>
            <div className="flex justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-white opacity-50" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (user) {
    return (
      <div className="fixed inset-0 w-full h-full flex items-center justify-center p-6 bg-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-white/[0.02] blur-[120px] pointer-events-none" />
        <Card className="w-full max-w-[440px] border-none shadow-2xl rounded-[32px] overflow-hidden bg-white/5 backdrop-blur-2xl border border-white/10 z-10">
          <div className="p-10 lg:p-12 text-center">
            <div className="flex justify-center mb-8 relative group">
              <div className="absolute inset-0 bg-white/10 rounded-full blur-xl animate-pulse" />
              <div className="p-6 rounded-3xl bg-white/5 border border-white/10 relative z-10">
                <Sparkles className="h-14 w-14 text-white" />
              </div>
            </div>
            <h2 className="text-3xl font-black mb-4 tracking-tighter uppercase leading-tight">ACEITAR <br />CONVITE</h2>
            <p className="text-gray-500 text-base lg:text-lg mb-8 leading-relaxed font-medium">
              Detectamos um convite pendente para sua conta corporativa.
            </p>
            
            <div className="space-y-6">
              {error && (
                <Alert variant="destructive" className="bg-red-500/10 border-none text-left rounded-2xl mb-6">
                  <AlertCircle className="h-5 w-5" />
                  <AlertDescription className="font-bold uppercase text-xs tracking-widest">{error}</AlertDescription>
                </Alert>
              )}
              
              <Button
                onClick={() => navigate('/auth')}
                className="w-full h-14 text-lg font-black rounded-2xl transition-all active:scale-[0.98] bg-white text-black hover:bg-white/90 shadow-lg shadow-white/5"
              >
                IR PARA LOGIN
                <ChevronRight className="ml-2 h-6 w-6" />
              </Button>
              
              <div className="pt-6 border-t border-white/5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">
                  CONECTADO COMO <span className="text-white">{user.email}</span>
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col md:flex-row bg-black text-white selection:bg-white/20 overflow-hidden">
      {/* Background Glows (Neutral) */}
      <div className="absolute top-[-15%] left-[-10%] w-[60%] h-[60%] bg-white/5 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* Lado Esquerdo - Branding/Marketing */}
      <div className="hidden md:flex md:w-1/2 h-full items-center justify-center p-12 relative border-r border-white/5 bg-[#080808] overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-lg">
          <div className="flex items-center gap-6 mb-16 group">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-white/5 rounded-3xl blur-xl" />
              <img 
                src="/logo-removebg.png" 
                alt="NEURELIX Logo" 
                className="h-20 w-20 relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              />
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase leading-none">NEURELIX <span className="text-white/40 block text-[10px] tracking-[0.5em] font-mono mt-1">NEXUS</span></h1>
          </div>
          
          <h2 className="text-6xl lg:text-7xl font-black mb-8 leading-[0.9] tracking-tight uppercase">
            ESTABELEÇA <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/30">SUA CONEXÃO.</span>
          </h2>
          
          <p className="text-lg lg:text-xl text-gray-400 mb-10 max-w-md leading-relaxed font-light">
            Sua participação foi solicitada. Ative seu protocolo para acessar o ecossistema Neurelix.
          </p>
          
          <div className="p-6 lg:p-8 rounded-[32px] bg-white/[0.03] border border-white/10 backdrop-blur-3xl flex items-center gap-6 shadow-2xl">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shrink-0">
              <Mail className="h-8 w-8 text-white/70" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] mb-1">E-mail do Convite</p>
              <p className="text-xl lg:text-2xl font-black text-white tracking-tight truncate uppercase leading-none">{inviteEmail || '...'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Form de Autenticação */}
      <div className="flex-1 h-full flex flex-col items-center justify-center p-6 lg:p-12 relative bg-black overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-[420px] py-12 flex flex-col justify-center relative z-10 min-h-full">
          <div className="md:hidden flex flex-col items-center mb-10">
            <img src="/logo-removebg.png" alt="Logo" className="h-16 w-16 mb-4" />
            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none text-center">Neurelix <span className="text-white/50 block text-[10px] tracking-[0.4em] mt-1">Nexus</span></h1>
          </div>

          <div className="space-y-4 mb-8 text-center md:text-left">
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight uppercase">
              ATIVE SEU <br />
              <span className="text-white glow-text">PROTOCOLO</span>
            </h2>
            <p className="text-gray-500 text-lg font-medium leading-relaxed">
              Você está a um passo de acessar a rede.
            </p>
          </div>

          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 bg-white/5 border border-white/10 rounded-2xl p-1 h-14">
              <TabsTrigger 
                value="signup" 
                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-black text-white/50 font-bold uppercase text-xs tracking-widest transition-all"
              >
                Novo Usuário
              </TabsTrigger>
              <TabsTrigger 
                value="login" 
                className="rounded-xl data-[state=active]:bg-white data-[state=active]:text-black text-white/50 font-bold uppercase text-xs tracking-widest transition-all"
              >
                Já Tenho Conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="mt-0 space-y-6 outline-none">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 mb-2">
                <p className="text-xs text-gray-400 font-medium leading-relaxed italic text-center text-balance px-2">
                  "Esta é sua primeira conexão? Defina seu nome e escolha uma senha para criar sua conta vinculada a este convite."
                </p>
              </div>

              <form onSubmit={handleSignUp} className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
                    <UserPlus className="h-3 w-3" /> Seu Nome Completo
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="DIGITE SEU NOME"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5 uppercase font-medium"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2 opacity-50">
                    <Mail className="h-3 w-3" /> E-mail Confirmado
                  </Label>
                  <Input
                    value={inviteEmail || ''}
                    disabled
                    className="h-14 bg-white/[0.01] border-white/5 font-bold text-lg rounded-2xl px-6 opacity-30 cursor-not-allowed uppercase"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="signup-password" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
                    <Key className="h-3 w-3" /> Definir Nova Senha
                  </Label>
                  <div className="relative group">
                    <Input
                      id="signup-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="ESCOLHA UMA SENHA"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-14 h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/20 hover:text-white transition-colors focus:outline-none"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="bg-red-500/10 border-none rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <AlertCircle className="h-5 w-5" />
                    <AlertDescription className="font-bold text-xs uppercase tracking-widest ml-2">{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg font-black shadow-lg shadow-white/5 active:scale-[0.98] transition-all rounded-2xl bg-white text-black hover:bg-white/90 uppercase tracking-tighter" 
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <>CRIAR CONTA E ENTRAR <ChevronRight className="ml-2 h-5 w-5" /></>}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="login" className="mt-0 space-y-6 outline-none">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 mb-2">
                <p className="text-xs text-gray-400 font-medium leading-relaxed italic text-center text-balance px-2">
                  "Já possui uma conta Nexus registrada com este e-mail? Entre com sua chave de acesso para vincular este novo convite."
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2 opacity-50">
                    <Mail className="h-3 w-3" /> Seu E-mail
                  </Label>
                  <Input
                    value={inviteEmail || ''}
                    disabled
                    className="h-14 bg-white/[0.01] border-white/5 font-bold text-lg rounded-2xl px-6 opacity-30 cursor-not-allowed uppercase"
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between ml-1">
                    <Label htmlFor="loginPassword" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 font-mono flex items-center gap-2">
                      <Key className="h-3 w-3" /> Sua Chave de Acesso
                    </Label>
                    <a href="#" className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] hover:text-white transition-colors">Recuperar</a>
                  </div>
                  <div className="relative group">
                    <Input
                      id="loginPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="DIGITE SUA SENHA"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-14 h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/20 hover:text-white transition-colors focus:outline-none"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="bg-red-500/10 border-none rounded-2xl shadow-lg">
                    <AlertCircle className="h-5 w-5" />
                    <AlertDescription className="font-bold text-xs uppercase tracking-widest ml-2">{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg font-black shadow-lg shadow-white/5 active:scale-[0.98] transition-all rounded-2xl bg-white text-black hover:bg-white/90 uppercase tracking-tighter" 
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <>AUTENTICAR E ENTRAR <ChevronRight className="ml-2 h-6 w-6" /></>}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          
          <div className="pt-8 mt-12 border-t border-white/5 text-center">
            <p className="text-[10px] text-gray-500 leading-relaxed font-bold tracking-[0.1em] uppercase">
              SISTEMA PROTEGIDO POR <br />
              <span className="text-white/20 font-mono tracking-[0.3em] mt-1 block">PROTOCOLOS NEXUS</span>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .glow-text {
          text-shadow: 0 0 15px rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
