import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Sparkles, Lightbulb, FileText, Shapes, Loader2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Face icon component
function FaceIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="46" fill="hsl(var(--background))" stroke="hsl(var(--foreground))" strokeWidth="4" />
      <path d="M 28 32 Q 35 28 42 32" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 58 34 L 72 28" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" fill="none" />
      <ellipse cx="35" cy="45" rx="4" ry="5" fill="hsl(var(--foreground))" />
      <ellipse cx="65" cy="45" rx="4" ry="5" fill="hsl(var(--foreground))" />
      <line x1="35" y1="70" x2="65" y2="70" stroke="hsl(var(--foreground))" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BearAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateElements?: (elements: any[]) => void;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bear-assistant`;

export function BearAssistant({ isOpen, onClose, onCreateElements }: BearAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Olá! Sou seu assistente de IA. Como posso ajudar você hoje?\n\nPosso:\n- Gerar ideias e textos\n- Resumir informações\n- Criar elementos para o board\n- Responder suas perguntas" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  const streamChat = useCallback(async (
    userMessages: Message[],
    action?: string
  ) => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ messages: userMessages, action }),
    });

    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(error.error || "Erro ao conectar com o assistente");
    }

    // Ler resposta JSON simples
    const data = await resp.json();
    const assistantContent = data.content || "";

    if (!assistantContent) {
      throw new Error("Resposta vazia do assistente");
    }

    // Adicionar mensagem do assistente
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && prev.length > 1) {
        return prev.map((m, i) => 
          i === prev.length - 1 ? { ...m, content: assistantContent } : m
        );
      }
      return [...prev, { role: "assistant", content: assistantContent }];
    });

    // Check if response contains elements to create
    if (assistantContent.includes('"type": "elements"')) {
      try {
        const jsonMatch = assistantContent.match(/\{[\s\S]*"type":\s*"elements"[\s\S]*\}/);
        if (jsonMatch && onCreateElements) {
          const elementsData = JSON.parse(jsonMatch[0]);
          onCreateElements(elementsData.items);
        }
      } catch (e) {
        console.log("Could not parse elements JSON");
      }
    }

    return assistantContent;
  }, [onCreateElements]);

  const handleSend = async (action?: string) => {
    const messageText = input.trim();
    if (!messageText && !action) return;

    const userMessage: Message = { role: "user", content: messageText || action || "" };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      await streamChat(
        newMessages.filter((_, i) => i > 0), // Skip initial greeting
        action
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Desculpe, ocorreu um erro: ${error instanceof Error ? error.message : "Erro desconhecido"}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickActions = [
    { icon: Lightbulb, label: "Gerar ideias", action: "generate_ideas", prompt: "Gere ideias criativas para meu projeto" },
    { icon: FileText, label: "Resumir", action: "summarize", prompt: "Resuma o conteúdo atual do board" },
    { icon: Shapes, label: "Criar elementos", action: "create_elements", prompt: "Crie elementos visuais para organizar minhas ideias" },
  ];

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full h-14 w-14 bg-background border hover:bg-muted shadow-lg p-0"
        >
          <FaceIcon size={32} />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 h-[500px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FaceIcon size={24} />
          <span className="font-semibold">Assistente</span>
          <Sparkles className="h-4 w-4 text-foreground/60" />
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      <div className="px-3 py-2 border-t flex gap-2">
        {quickActions.map((qa) => (
          <Button
            key={qa.action}
            variant="outline"
            size="sm"
            className="text-xs flex-1"
            onClick={() => {
              setInput(qa.prompt);
              handleSend(qa.action);
            }}
            disabled={isLoading}
          >
            <qa.icon className="h-3 w-3 mr-1" />
            {qa.label}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[40px] max-h-[100px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
