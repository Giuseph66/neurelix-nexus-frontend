import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Send, Sparkles, Lightbulb, FileText, Shapes, Loader2, Plus, History, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { apiFetch, ApiError } from '@/lib/api';

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AssistantSession {
  id: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface BearAssistantAnalysisRequest {
  id: string;
  selectionJson: string;
  shapeCount: number;
}

interface BearAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateElements?: (elements: any[]) => void;
  activeTool?: ToolType;
  whiteboardId?: string;
  analysisRequest?: BearAssistantAnalysisRequest;
  onAnalysisHandled?: (id: string) => void;
}

const INITIAL_GREETING =
  "Olá! Sou seu assistente de IA. Como posso ajudar você hoje?\n\nPosso:\n- Gerar ideias e textos\n- Resumir informações\n- Criar elementos para o board\n- Responder suas perguntas";

const ANALYZE_SELECTION_PREFIX = '[ANALYZE_SELECTION]';

const buildAnalysisSummary = (count: number) =>
  `Enviei ${count} ${count === 1 ? 'elemento' : 'elementos'} para análise.`;

const buildAnalysisPrompt = (payload: BearAssistantAnalysisRequest) => {
  const subject =
    payload.shapeCount === 1
      ? 'o elemento selecionado'
      : `os ${payload.shapeCount} elementos selecionados`;
  return `${ANALYZE_SELECTION_PREFIX} count=${payload.shapeCount}
Analise ${subject} no quadro. Forneça um resumo do que foi desenhado, destaque etapas/decisões e contexto do conteúdo.
Não gere novos elementos e não responda com JSON.

JSON:
${payload.selectionJson}`;
};

export function BearAssistant({
  isOpen,
  onClose,
  onCreateElements,
  activeTool = 'select',
  whiteboardId,
  analysisRequest,
  onAnalysisHandled,
}: BearAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: INITIAL_GREETING }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loadedHistoryForRef = useRef<string | null>(null);
  const analysisHandledRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!isOpen || !whiteboardId) {
      setSessions([]);
      setActiveSessionId(null);
      loadedHistoryForRef.current = null;
      return;
    }

    let cancelled = false;

    const loadSessions = async () => {
      setIsLoadingSessions(true);
      try {
        const data = await apiFetch<{ sessions: AssistantSession[] }>(
          `/functions/v1/bear-assistant/sessions?whiteboardId=${whiteboardId}`
        );
        let nextSessions = Array.isArray(data.sessions) ? data.sessions : [];

        if (nextSessions.length === 0) {
          const created = await apiFetch<{ session: AssistantSession }>(
            '/functions/v1/bear-assistant/sessions',
            { method: 'POST', body: { whiteboardId } }
          );
          nextSessions = created.session ? [created.session] : [];
        }

        if (cancelled) return;
        setSessions(nextSessions);
        const fallbackId = nextSessions[0]?.id ?? null;
        setActiveSessionId((prev) =>
          prev && nextSessions.some((session) => session.id === prev) ? prev : fallbackId
        );
        loadedHistoryForRef.current = null;
      } catch (error) {
        console.error("Erro ao carregar sessões do assistente:", error);
      } finally {
        if (!cancelled) setIsLoadingSessions(false);
      }
    };

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [isOpen, whiteboardId]);

  useEffect(() => {
    if (!isOpen || !whiteboardId || !activeSessionId) return;
    if (loadedHistoryForRef.current === activeSessionId) return;

    loadedHistoryForRef.current = activeSessionId;
    let cancelled = false;

    setIsLoadingHistory(true);
    setMessages(analysisRequest ? [] : [{ role: "assistant", content: INITIAL_GREETING }]);
    apiFetch<{ messages: Message[] }>(
      `/functions/v1/bear-assistant/history?whiteboardId=${whiteboardId}&sessionId=${activeSessionId}`
    )
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(data.messages.map((msg) => ({ role: msg.role, content: msg.content })));
        }
      })
      .catch((error) => {
        console.error("Erro ao carregar histórico do assistente:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, whiteboardId, activeSessionId, analysisRequest]);

  const streamChat = useCallback(async (
    userMessages: Message[],
    action?: string,
    sessionIdOverride?: string
  ) => {
    const data = await apiFetch<{ content: string; finishReason?: string }>('/functions/v1/bear-assistant', {
      method: 'POST',
      body: {
        messages: userMessages,
        action,
        whiteboardId,
        sessionId: (sessionIdOverride ?? activeSessionId) || undefined,
      },
      auth: true, // Bear assistant requer autenticação
    });
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
  }, [onCreateElements, whiteboardId, activeSessionId]);

  const createSession = useCallback(async (title?: string) => {
    if (!whiteboardId) return;
    setIsLoadingSessions(true);
    try {
      const data = await apiFetch<{ session: AssistantSession }>(
        '/functions/v1/bear-assistant/sessions',
        { method: 'POST', body: { whiteboardId, title } }
      );
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        loadedHistoryForRef.current = null;
        return data.session;
      }
    } catch (error) {
      console.error("Erro ao criar sessão do assistente:", error);
      return null;
    } finally {
      setIsLoadingSessions(false);
    }
  }, [whiteboardId]);

  const handleCreateSession = useCallback(async () => {
    if (!whiteboardId) return;
    const titleInput = window.prompt("Nome da nova sessão", "");
    if (titleInput === null) return;
    const title = titleInput.trim() || undefined;

    const created = await createSession(title);
    if (created) {
      setMessages([{ role: "assistant", content: INITIAL_GREETING }]);
    }
  }, [whiteboardId, createSession]);

  const handleRenameSession = useCallback(async () => {
    if (!whiteboardId || !activeSessionId) return;
    const currentTitle = sessions.find((session) => session.id === activeSessionId)?.title || "";
    const titleInput = window.prompt("Renomear sessão", currentTitle);
    if (titleInput === null) return;
    const title = titleInput.trim();
    if (!title) return;

    setIsLoadingSessions(true);
    try {
      const data = await apiFetch<{ session: AssistantSession }>(
        `/functions/v1/bear-assistant/sessions/${activeSessionId}`,
        { method: 'PATCH', body: { title } }
      );
      if (data.session) {
        setSessions((prev) =>
          prev.map((session) => (session.id === data.session.id ? { ...session, title: data.session.title } : session))
        );
      }
    } catch (error) {
      console.error("Erro ao renomear sessão do assistente:", error);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [whiteboardId, activeSessionId, sessions]);

  const ensureActiveSession = useCallback(async () => {
    if (activeSessionId) return activeSessionId;
    if (!whiteboardId || isLoadingSessions) return null;

    if (sessions.length > 0) {
      const fallbackId = sessions[0]?.id ?? null;
      if (fallbackId) setActiveSessionId(fallbackId);
      return fallbackId;
    }

    const created = await createSession();
    return created?.id ?? null;
  }, [activeSessionId, whiteboardId, isLoadingSessions, sessions, createSession]);

  const stripGreeting = useCallback((currentMessages: Message[]) => {
    if (
      currentMessages.length === 1 &&
      currentMessages[0]?.role === "assistant" &&
      currentMessages[0]?.content === INITIAL_GREETING
    ) {
      return [];
    }
    return currentMessages;
  }, []);

  useEffect(() => {
    if (!analysisRequest || !isOpen || !whiteboardId) return;
    if (analysisHandledRef.current === analysisRequest.id) return;
    if (isLoadingSessions || isLoadingHistory) return;

    const runAnalysis = async () => {
      const sessionId = await ensureActiveSession();
      if (!sessionId) return;

      analysisHandledRef.current = analysisRequest.id;

      const summaryMessage: Message = {
        role: "user",
        content: buildAnalysisSummary(analysisRequest.shapeCount),
      };

      const baseMessages = stripGreeting(messages);
      setMessages([...baseMessages, summaryMessage]);
      setIsLoading(true);
      BearCore.getInstance().setState({ expression: 'thinking' });

      try {
        const requestMessages = [
          ...baseMessages,
          { role: "user", content: buildAnalysisPrompt(analysisRequest) },
        ];
        await streamChat(requestMessages, 'analyze_selection', sessionId);
        BearCore.getInstance().setState({ expression: 'happy' });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";
        const isTooLarge =
          (error instanceof ApiError && error.status === 413) ||
          /context|token|length|size|too large/i.test(message);

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: isTooLarge
              ? "Foram selecionados muitos elementos. Selecione uma quantidade menor."
              : `Desculpe, ocorreu um erro: ${message}`,
          },
        ]);
        BearCore.getInstance().setState({ expression: 'error' });
      } finally {
        setIsLoading(false);
        setTimeout(() => {
          BearCore.getInstance().setState({ expression: 'neutral' });
        }, 2000);
        onAnalysisHandled?.(analysisRequest.id);
      }
    };

    void runAnalysis();
  }, [
    analysisRequest,
    isOpen,
    whiteboardId,
    isLoadingSessions,
    isLoadingHistory,
    ensureActiveSession,
    messages,
    streamChat,
    stripGreeting,
    onAnalysisHandled,
  ]);

  const handleSend = async (action?: string) => {
    const messageText = input.trim();
    if (!messageText && !action) return;
    if (whiteboardId && !activeSessionId) return;

    const userMessage: Message = { role: "user", content: messageText || action || "" };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Update Bear Expression
    BearCore.getInstance().setState({ expression: 'thinking' });

    try {
      const shouldSkipGreeting =
        newMessages[0]?.role === "assistant" && newMessages[0]?.content === INITIAL_GREETING;
      await streamChat(shouldSkipGreeting ? newMessages.slice(1) : newMessages, action);
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

  const activeSessionTitle =
    sessions.find((session) => session.id === activeSessionId)?.title || "Sessões";
  const sessionsDisabled = !whiteboardId || isLoadingSessions;

  if (!isOpen) return <GhostOverlay />; // Always render GhostOverlay even if chat is closed

  const assistantContent = (
    <>
      <GhostOverlay />
      {isMinimized ? (
        <div className="fixed bottom-4 right-4" style={{ zIndex: 99999 }}>
          <Button
            onClick={() => setIsMinimized(false)}
            className="rounded-full h-14 w-14 bg-background border hover:bg-muted shadow-lg p-0 overflow-hidden"
          >
            <BearFace size={32} expression={expression} />
          </Button>
        </div>
      ) : (
        <div className="fixed bottom-4 right-4 w-96 h-[500px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ zIndex: 99999 }}>
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <BearFace size={24} expression={expression} />
              <div className="flex flex-col">
                <span className="font-semibold text-sm leading-none flex items-center gap-1">
                  Assistente
                  <Sparkles className="h-3 w-3 text-foreground/60" />
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
                    disabled={sessionsDisabled}
                  >
                    <History className="h-3.5 w-3.5 mr-1.5" />
                    <span className="max-w-[100px] truncate">{activeSessionTitle}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 z-[100000]">
                  {sessions.length === 0 && (
                    <DropdownMenuItem disabled>Nenhuma sessão</DropdownMenuItem>
                  )}
                  {sessions.map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onSelect={() => setActiveSessionId(session.id)}
                    >
                      <span className="flex items-center gap-2">
                        {session.id === activeSessionId ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <span className="h-3 w-3" />
                        )}
                        {session.title}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleRenameSession}
                    disabled={!activeSessionId || sessionsDisabled}
                  >
                    <Pencil className="h-3 w-3 mr-2" />
                    Renomear sessão
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCreateSession}
                disabled={sessionsDisabled}
                title="Nova sessão"
              >
                <Plus className="h-4 w-4" />
              </Button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={onClose}>
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
              {(isLoading || isLoadingHistory || isLoadingSessions) && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Actions */}
          <div className="px-3 py-2 border-t">
            <div className="flex gap-2 overflow-x-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
              {quickActions.map((qa) => (
                <Button
                  key={qa.action}
                  variant="outline"
                  size="sm"
                  className="text-xs flex-shrink-0 flex-1 min-w-[120px]"
                  onClick={() => {
                    setInput(qa.prompt);
                    handleSend(qa.action);
                  }}
                  disabled={isLoading || isLoadingHistory || isLoadingSessions || (whiteboardId && !activeSessionId)}
                >
                  <qa.icon className="h-3 w-3 mr-1" />
                  {qa.label}
                </Button>
              ))}
            </div>
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
                disabled={isLoading || isLoadingHistory || isLoadingSessions || (whiteboardId && !activeSessionId)}
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading || isLoadingHistory || isLoadingSessions || (whiteboardId && !activeSessionId)}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Renderizar via Portal para garantir que fique acima de tudo
  if (typeof window !== 'undefined') {
    return createPortal(assistantContent, document.body);
  }

  return assistantContent;
}
