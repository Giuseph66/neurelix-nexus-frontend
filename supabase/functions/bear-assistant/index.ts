import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o Super-Agente, um assistente de IA amigável e criativo integrado a um quadro branco colaborativo.

Suas capacidades:
1. **Gerar ideias e textos**: Crie sugestões de brainstorming, textos para post-its, tópicos para discussão
2. **Resumir e organizar**: Ajude a sintetizar informações e organizar pensamentos
3. **Criar elementos**: Sugira layouts, estruturas visuais e como organizar elementos no board
4. **Responder perguntas**: Tire dúvidas sobre o projeto e ofereça orientações

Diretrizes:
- Seja conciso e prático nas respostas
- Use português brasileiro
- Quando sugerir elementos visuais, descreva-os de forma clara
- Forneça listas numeradas ou com bullets quando apropriado
- Seja amigável mas profissional

Quando o usuário pedir para criar elementos, responda em formato JSON estruturado:
{
  "type": "elements",
  "items": [
    { "type": "postit", "text": "Texto do post-it", "color": "yellow" },
    { "type": "text", "content": "Texto livre" }
  ]
}

Para outras respostas, use texto normal formatado em markdown.`;

// Converte mensagens do formato OpenAI para formato Gemini
function convertMessagesToGeminiFormat(messages: any[]) {
  const geminiContents: any[] = [];
  let systemPrompt = "";
  
  // Separar system prompts das mensagens
  const userMessages = messages.filter(msg => {
    if (msg.role === "system") {
      systemPrompt += (systemPrompt ? "\n\n" : "") + msg.content;
      return false;
    }
    return true;
  });
  
  // Construir histórico de conversa
  for (const msg of userMessages) {
    if (msg.role === "user") {
      // Se é a primeira mensagem do usuário e há system prompt, incluir no início
      const userText = geminiContents.length === 0 && systemPrompt
        ? `${systemPrompt}\n\n${msg.content}`
        : msg.content;
      
      geminiContents.push({
        role: "user",
        parts: [{ text: userText }]
      });
    } else if (msg.role === "assistant") {
      geminiContents.push({
        role: "model",
        parts: [{ text: msg.content }]
      });
    }
  }
  
  // Se não há mensagens de usuário mas há system prompt, criar uma mensagem inicial
  if (geminiContents.length === 0 && systemPrompt) {
    geminiContents.push({
      role: "user",
      parts: [{ text: systemPrompt }]
    });
  }
  
  return geminiContents;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, action } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada. Configure a chave nas secrets do Supabase.");
    }

    // Construir prompt com instruções do sistema
    let systemInstructions = SYSTEM_PROMPT;

    // Adicionar contexto específico da ação
    if (action === "generate_ideas") {
      systemInstructions += "\n\nO usuário quer gerar ideias. Forneça uma lista de 5-7 ideias criativas e acionáveis.";
    } else if (action === "summarize") {
      systemInstructions += "\n\nO usuário quer um resumo. Seja conciso e destaque os pontos principais.";
    } else if (action === "create_elements") {
      systemInstructions += "\n\nO usuário quer criar elementos visuais. Responda APENAS com JSON estruturado no formato especificado.";
    }

    // Converter mensagens para formato Gemini
    const geminiContents = convertMessagesToGeminiFormat([
      { role: "system", content: systemInstructions },
      ...messages,
    ]);

    // URL da API do Gemini sem streaming (resposta completa)
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: geminiContents,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
      }
    };

    console.log("Calling Gemini API (non-streaming):", API_URL.substring(0, 80) + "...");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log("Gemini API response status:", response.status);

    if (!response.ok) {
      const status = response.status;
      let errorMessage = "Erro no serviço de IA";
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || `Erro ${status}`;
        console.error("Gemini API error data:", errorData);
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || `Erro ${status}`;
        console.error("Gemini API error text:", errorText);
      }
      
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (status === 401 || status === 403) {
        return new Response(
          JSON.stringify({ error: "Chave API inválida ou não autorizada. Verifique a configuração da GEMINI_API_KEY." }),
          { status: status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("Gemini API error:", status, errorMessage);
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Gemini API response received");

    // Extrair o texto da resposta do Gemini
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error("Invalid Gemini response structure:", data);
      return new Response(
        JSON.stringify({ error: "Resposta inválida da API do Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const generatedText = data.candidates[0].content.parts[0]?.text || "";
    
    if (!generatedText) {
      console.error("No text content in Gemini response:", data);
      return new Response(
        JSON.stringify({ error: "Resposta vazia da API do Gemini" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Retornar resposta no formato JSON simples
    const responseData = {
      content: generatedText,
      finishReason: data.candidates[0].finishReason || "stop"
    };
    
    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("bear-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
