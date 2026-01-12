import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Eye, EyeOff, Loader2, UserPlus, Mail, Key, ChevronRight } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/usePageTitle";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    fullName: z.string().min(1, "Nome é obrigatório"),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
    confirmPassword: z.string().min(1, "Confirme a senha"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export default function CreateUser() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signUp, user } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  usePageTitle("Criar Usuário - NEURELIX NEXUS");

  useEffect(() => {
    // Se já estiver logado, não faz sentido abrir signup (evita confusão)
    if (user) navigate("/projects");
  }, [user, navigate]);

  const formValue = useMemo(
    () => ({ fullName, email, password, confirmPassword }),
    [fullName, email, password, confirmPassword]
  );

  function validate() {
    const parsed = schema.safeParse(formValue);
    if (parsed.success) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = (issue.path?.[0] as string) || "form";
      next[key] = issue.message;
    }
    setErrors(next);
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    const { error } = await signUp(email, password, fullName);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Erro ao criar usuário",
        description:
          error.message.includes("already exists") || error.message.includes("already registered")
            ? "Este e-mail já possui uma conta ativa."
            : error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Usuário criado",
      description: "Conta criada com sucesso. Você já está autenticado.",
    });
    navigate("/projects");
  }

  return (
    <div className="fixed inset-0 w-full h-full flex items-center justify-center p-6 bg-black selection:bg-white/20 text-white overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-[-12%] right-[-12%] w-[55%] h-[55%] bg-white/5 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute bottom-[-12%] left-[-12%] w-[45%] h-[45%] bg-white/[0.02] rounded-full blur-[120px] pointer-events-none z-0" />

      <div className="w-full max-w-[520px] relative z-10">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-white/60 mb-3">
            <div className="p-2 rounded-2xl bg-white/5 border border-white/10">
              <UserPlus className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.3em] font-mono">Protocolo de Cadastro</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase leading-tight">
            Criar usuário
          </h1>
          <p className="text-gray-500 mt-2 text-sm md:text-base font-medium leading-relaxed">
            Defina nome, email e uma senha para criar a conta.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-[28px] bg-white/[0.03] border border-white/10 backdrop-blur-2xl p-6 md:p-8">
          <div className="space-y-3">
            <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
              <UserPlus className="h-3 w-3" /> Nome completo
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="DIGITE SEU NOME"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isLoading}
              className="h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5 uppercase font-medium"
            />
            {errors.fullName && (
              <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {errors.fullName}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
              <Mail className="h-3 w-3" /> Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="USER@NEURELIX.COM"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5 uppercase font-medium"
            />
            {errors.email && (
              <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
              <Key className="h-3 w-3" /> Senha
            </Label>
            <div className="relative group">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="pr-14 h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/20 hover:text-white transition-colors focus:outline-none"
                onClick={() => setShowPassword((p) => !p)}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {errors.password}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono flex items-center gap-2">
              <Key className="h-3 w-3" /> Confirmar senha
            </Label>
            <div className="relative group">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className="pr-14 h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/20 hover:text-white transition-colors focus:outline-none"
                onClick={() => setShowConfirmPassword((p) => !p)}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 text-lg font-black active:scale-[0.98] transition-all rounded-2xl bg-white text-black hover:bg-white/90 uppercase tracking-tighter shadow-lg shadow-white/5"
            >
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  CRIAR CONTA
                  <ChevronRight className="ml-2 h-6 w-6" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={() => navigate("/auth")}
              className="w-full h-12 rounded-2xl text-white/70 hover:text-white hover:bg-white/10"
            >
              Voltar para login
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}


