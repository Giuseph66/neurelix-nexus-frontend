# Neurelix Nexus - Frontend

Frontend da plataforma Neurelix Nexus, uma solução unificada para gestão de projetos, código e colaboração em equipe.

## 🚀 Tecnologias

- **React 18** - Biblioteca para construção de interfaces
- **TypeScript** - Tipagem estática
- **Vite** - Build tool e dev server
- **React Router** - Roteamento
- **TanStack Query** - Gerenciamento de estado e cache de dados
- **shadcn/ui** - Componentes UI baseados em Radix UI
- **Tailwind CSS** - Framework CSS utilitário
- **Fabric.js** - Canvas para funcionalidades de desenho
- **tldraw** - Editor de whiteboard colaborativo
- **React Hook Form + Zod** - Formulários e validação

## 📋 Pré-requisitos

- Node.js 18+ ou Bun
- npm, yarn, pnpm ou bun

## 🛠️ Instalação

1. Clone o repositório (se ainda não tiver feito):
```bash
git clone <url-do-repositorio>
cd neurelix-nexus/front
```

2. Instale as dependências:
```bash
npm install
# ou
bun install
# ou
yarn install
```

## ⚙️ Configuração

Crie um arquivo `.env` na raiz do diretório `front` com as seguintes variáveis:

```env
VITE_SUPABASE_URL=sua_url_do_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=sua_chave_publica_do_supabase
```

## 🎯 Scripts Disponíveis

- `npm run dev` - Inicia o servidor de desenvolvimento na porta 8080
- `npm run build` - Cria build de produção
- `npm run build:dev` - Cria build em modo desenvolvimento
- `npm run preview` - Preview do build de produção
- `npm run lint` - Executa o linter ESLint

## 📁 Estrutura do Projeto

```
front/
├── public/              # Arquivos estáticos
├── src/
│   ├── components/      # Componentes React
│   │   ├── codigo/      # Componentes relacionados a código/PRs
│   │   ├── layout/      # Componentes de layout (Header, Sidebar)
│   │   ├── tarefas/     # Componentes de gestão de tarefas (Kanban, Sprints)
│   │   ├── ui/          # Componentes UI do shadcn/ui
│   │   └── whiteboard/  # Componentes do whiteboard colaborativo
│   ├── contexts/        # Contextos React (Auth, etc)
│   ├── hooks/           # Custom hooks
│   ├── integrations/    # Integrações externas (Supabase)
│   ├── lib/             # Utilitários e helpers
│   ├── pages/           # Páginas da aplicação
│   └── types/           # Definições de tipos TypeScript
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```

## 🎨 Funcionalidades Principais

### 📝 Gestão de Tarefas
- Kanban board com drag & drop
- Sprints e backlog
- Epics e hierarquia de tarefas
- Integração com repositórios Git

### 💻 Gestão de Código
- Navegador de código
- Visualização de Pull Requests
- Review de código
- Integração com GitHub OAuth
- Comentários em código

### 🎨 Whiteboard Colaborativo
- Desenho colaborativo em tempo real
- Histórico de edições
- Presença de usuários
- Comentários e threads

### 👥 Gestão de Projetos
- Múltiplos projetos
- Gestão de equipe e membros
- Convites para projetos
- Controle de permissões e roles

## 🚦 Desenvolvimento

1. Inicie o servidor de desenvolvimento:
```bash
npm run dev
```

2. Acesse a aplicação em `http://localhost:8080`

3. O servidor suporta hot-reload automático durante o desenvolvimento

## 🏗️ Build para Produção

```bash
npm run build
```

Os arquivos de produção serão gerados na pasta `dist/`.

Para visualizar o build localmente:
```bash
npm run preview
```

## 🔧 Configuração do Vite

O projeto está configurado para:
- Usar React com SWC para compilação rápida
- Resolver imports com alias `@/` apontando para `src/`
- Servir na porta 8080
- Suportar IPv6 (host: "::")

## 📦 Componentes UI

O projeto utiliza [shadcn/ui](https://ui.shadcn.com/) para componentes base. Os componentes estão em `src/components/ui/` e podem ser customizados conforme necessário.

## 🔐 Autenticação

A autenticação é gerenciada através do contexto `AuthContext` e integra com o backend via Supabase. O cliente Supabase está configurado para não usar autenticação nativa (migrado para JWT do backend local).

## 📝 Linting

O projeto utiliza ESLint para manter a qualidade do código. Execute:
```bash
npm run lint
```

## 🤝 Contribuindo

1. Crie uma branch para sua feature
2. Faça suas alterações
3. Certifique-se de que o lint passa
4. Faça commit e push
5. Abra um Pull Request

## 📄 Licença

Este projeto é proprietário e está protegido por uma licença privada. Todos os direitos são reservados à Neurelix.

Para mais informações, consulte o arquivo [LICENSE.md](../LICENSE.md) na raiz do repositório.

