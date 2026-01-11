import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff, LayoutDashboard, CheckSquare, Code2, Sparkles, ChevronRight } from "lucide-react";
import { z } from "zod";
import { usePageTitle } from "@/hooks/usePageTitle";

const emailSchema = z.string().email("Email inválido");
const passwordSchema = z.string().min(6, "Senha deve ter pelo menos 6 caracteres");

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  usePageTitle("Autenticação - NEURELIX NEXUS");

  useEffect(() => {
    if (user) {
      navigate("/projects");
    }
  }, [user, navigate]);

  const validateLogin = () => {
    const newErrors: Record<string, string> = {};
    
    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.email = e.errors[0].message;
      }
    }

    try {
      passwordSchema.parse(password);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.password = e.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLogin()) return;

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast({
        title: "Erro ao entrar",
        description: error.message === "Invalid login credentials" 
          ? "Email ou senha incorretos" 
          : error.message,
        variant: "destructive",
      });
    } else {
      navigate("/projects");
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col md:flex-row bg-black selection:bg-white/20 text-white overflow-hidden">
      {/* Background Glows (Neutral) */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-white/5 rounded-full blur-[120px] pointer-events-none animate-pulse z-0" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/[0.02] rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Lado Esquerdo - Branding/Marketing */}
      <div className="hidden md:flex md:w-1/2 h-full items-center justify-center p-8 lg:p-12 relative border-r border-white/5 bg-[#050505] overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-lg">
          <div className="flex items-center gap-6 mb-12 group">
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-white/5 rounded-3xl blur-xl group-hover:bg-white/10 transition-all duration-500" />
              <img 
                src="/logo-removebg.png" 
                alt="NEURELIX Logo" 
                className="h-20 w-20 relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transform group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div>
              <h1 className="text-4xl lg:text-5xl font-black tracking-tighter leading-none mb-1">
                NEURELIX
              </h1>
              <span className="text-white/50 font-mono tracking-[0.5em] text-xs lg:text-sm uppercase">
                NEXUS
              </span>
            </div>
          </div>
          
          <h2 className="text-5xl lg:text-6xl font-black mb-8 leading-[0.9] tracking-tight uppercase">
            DA IDEIA AO <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40">CÓDIGO.</span>
          </h2>
          
          <p className="text-lg lg:text-xl text-gray-500 mb-10 max-w-md leading-relaxed font-light">
            A plataforma unificada que conecta sua visão criativa e o desenvolvimento em um ecossistema único.
          </p>
          
          <div className="grid grid-cols-2 gap-4 lg:gap-6">
            {[
              { title: "Whiteboard", desc: "Visual", icon: LayoutDashboard },
              { title: "Tarefas", desc: "Sprints", icon: CheckSquare },
              { title: "Código", desc: "Git Core", icon: Code2 },
              { title: "IA Bear", desc: "Neural", icon: Sparkles },
            ].map((item, i) => (
              <div 
                key={i} 
                className="group p-4 lg:p-6 rounded-3xl bg-white/[0.03] border border-white/5 backdrop-blur-xl hover:border-white/20 transition-all duration-300"
              >
                <div className="p-2 rounded-2xl bg-white/5 w-fit mb-3 group-hover:bg-white/10 transition-colors">
                  <item.icon className="h-5 w-5 text-white/70" />
                </div>
                <h3 className="font-bold text-sm lg:text-base mb-0.5 group-hover:text-white transition-colors">
                  {item.title}
                </h3>
                <p className="text-[10px] lg:text-xs text-gray-500 font-medium tracking-tight uppercase">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lado Direito - Form de Autenticação */}
      <div className="flex-1 h-full flex items-center justify-center p-6 lg:p-12 relative bg-black overflow-y-auto overflow-x-hidden">
        <div className="w-full max-w-[400px] py-12 flex flex-col justify-center relative z-10 min-h-full">
          {/* Mobile Logo */}
          <div className="md:hidden flex flex-col items-center mb-10">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-white/5 rounded-full blur-lg" />
              <img src="/logo-removebg.png" alt="Logo" className="h-16 w-16 relative z-10" />
            </div>
            <h1 className="text-2xl font-black tracking-tighter uppercase leading-none">NEURELIX <span className="text-white/50 block text-[10px] tracking-[0.4em] mt-1">NEXUS</span></h1>
          </div>

          <div className="space-y-4 mb-10 text-center md:text-left">
            <h2 className="text-4xl lg:text-5xl font-black tracking-tighter leading-tight uppercase">
              BEM-VINDO AO <br />
              <span className="text-white glow-text">NEXUS</span>
            </h2>
            <p className="text-gray-500 text-lg font-medium leading-relaxed">
              Acesse sua conta corporativa.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="login-email" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 ml-1 font-mono">
                Identificação
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="USER@NEURELIX.COM"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6 placeholder:text-white/5"
              />
              {errors.email && (
                <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {errors.email}
                </p>
              )}
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between ml-1">
                <Label htmlFor="login-password" className="text-xs font-bold uppercase tracking-[0.3em] text-white/40 font-mono">
                  Senha
                </Label>
                {/*
                <a href="#" className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">
                  Esqueci
                </a>
                  */}
              </div>
              <div className="relative group">
                <Input
                  id="login-password"
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="pr-14 h-14 bg-white/[0.03] border-white/10 focus:border-white/30 focus:ring-0 transition-all text-lg rounded-2xl px-6"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-5 text-white/20 hover:text-white transition-colors focus:outline-none"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                >
                  {showLoginPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 font-bold uppercase tracking-wider flex items-center gap-2 mt-2 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {errors.password}
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-black active:scale-[0.98] transition-all rounded-2xl mt-4 bg-white text-black hover:bg-white/90 uppercase tracking-tighter shadow-lg shadow-white/5" 
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                "ENTRAR"
              )}
            </Button>
          </form>
          
          <div className="pt-8 mt-12 border-t border-white/5 flex flex-col items-center">
            <p className="text-center text-[10px] text-gray-500 leading-relaxed font-medium uppercase tracking-[0.2em]">
              SISTEMA PROTEGIDO POR <br />
              <span className="text-white/20 font-mono tracking-[0.3em] mt-1 block">PROTOCOLOS NEXUS</span>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .glow-text {
          text-shadow: 0 0 15px rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
