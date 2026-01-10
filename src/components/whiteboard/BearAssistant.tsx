import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Sparkles, Lightbulb, FileText, Shapes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BearFace } from "./BearFace";
import { ToolType } from "./types";
import { BearCore } from "./bear-core/BearCore";
import { BearExpression } from "./bear-core/types";
import { SkillManager } from "./bear-core/SkillManager";
import { EyeTrackingSkill } from "./skills/EyeTrackingSkill";
import { FollowCursorSkill } from "./skills/FollowCursorSkill";
import { AutocompleteSkill } from "./skills/AutocompleteSkill";
import { FlowSuggestionSkill } from "./skills/FlowSuggestionSkill";
import { GhostOverlay } from "./GhostOverlay";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface BearAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateElements?: (elements: any[]) => void;
  activeTool?: ToolType;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bear-assistant`;

export function BearAssistant({ isOpen, onClose, onCreateElements, activeTool = 'select' }: BearAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Olá! Sou seu assistente de IA. Como posso ajudar você hoje?\n\nPosso:\n- Gerar ideias e textos\n- Resumir informações\n- Criar elementos para o board\n- Responder suas perguntas" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Bear Core State
  const [expression, setExpression] = useState<BearExpression>('neutral');

  // Initialize Bear Core and Skills
  useEffect(() => {
    const core = BearCore.getInstance({ debug: true }); // Enable debug for now

    // Register Skills
    const skillManager = core.skillRegistry;
    skillManager.register(new EyeTrackingSkill());
    // skillManager.register(new FollowCursorSkill()); // Disabled: User wants fixed position
    skillManager.register(new AutocompleteSkill());
    skillManager.register(new FlowSuggestionSkill());

    // Subscribe to state
    const unsubscribe = core.subscribe((state) => {
      setExpression(state.expression);
    });

    // Global event listeners for skills
    const handleKeyDown = (e: KeyboardEvent) => {
      core.dispatch({ type: 'keydown', payload: { key: e.key } });
    };

    const handleSelection = () => {
      // Mock selection event - in real app would listen to canvas selection
      // For demo, we can trigger it manually or assume it's hooked up
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
      core.dispose();
    };
  }, []);

  // Handle typing for Autocomplete Skill
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInput(text);

    const core = BearCore.getInstance();
    core.dispatch({
      type: 'typing',
      payload: { text, cursorIndex: e.target.selectionStart }
    });
  };

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
    if (assistantContent.includes('"type": "elements"') || assistantContent.includes('"type": "graph"')) {
      try {
        const jsonMatch = assistantContent.match(/\{[\s\S]*"type":\s*"(elements|graph)"[\s\S]*\}/);
        if (jsonMatch && onCreateElements) {
          const elementsData = JSON.parse(jsonMatch[0]);
          // Pass the whole object if it's a graph, or just items if it's the old format
          onCreateElements(elementsData.type === 'graph' ? elementsData : elementsData.items);
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

    // Update Bear Expression
    BearCore.getInstance().setState({ expression: 'thinking' });

    try {
      await streamChat(
        newMessages.filter((_, i) => i > 0), // Skip initial greeting
        action
      );
      BearCore.getInstance().setState({ expression: 'happy' });
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Desculpe, ocorreu um erro: ${error instanceof Error ? error.message : "Erro desconhecido"}` }
      ]);
      BearCore.getInstance().setState({ expression: 'error' });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        BearCore.getInstance().setState({ expression: 'neutral' });
      }, 2000);
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

  if (!isOpen) return <GhostOverlay />; // Always render GhostOverlay even if chat is closed

  if (isMinimized) {
    return (
      <>
        <GhostOverlay />
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => setIsMinimized(false)}
            className="rounded-full h-14 w-14 bg-background border hover:bg-muted shadow-lg p-0 overflow-hidden"
          >
            <BearFace size={32} expression={expression} />
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <GhostOverlay />
      <div className="fixed bottom-4 right-4 z-50 w-96 h-[500px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <BearFace size={24} expression={expression} />
            <span className="font-semibold">Assistente</span>
            <Sparkles className="h-4 w-4 text-foreground/60" />
          </div>
          <div className="flex items-center gap-1">
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
              onChange={handleInputChange}
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
    </>
  );
}
