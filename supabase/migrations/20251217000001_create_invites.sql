-- Migração: Criar tabela de convites de membros para projetos

-- ============================================================
-- TABELA project_invites
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role DEFAULT 'developer'::public.app_role NOT NULL,
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token uuid DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  accepted_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + interval '7 days') NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_project_invites_token ON public.project_invites(token);
CREATE INDEX IF NOT EXISTS idx_project_invites_project_id ON public.project_invites(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_email ON public.project_invites(email);
CREATE INDEX IF NOT EXISTS idx_project_invites_accepted_at ON public.project_invites(accepted_at);

-- Constraint: Um convite ativo por email/projeto (apenas se não foi aceito)
-- Usando partial unique index para permitir múltiplos convites aceitos
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invites_unique_active 
ON public.project_invites(project_id, email) 
WHERE accepted_at IS NULL;

-- ============================================================
-- TRIGGER PARA updated_at
-- ============================================================

CREATE TRIGGER update_project_invites_updated_at
  BEFORE UPDATE ON public.project_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem ver convites do projeto se forem membros
CREATE POLICY "Users can view invites for their projects"
  ON public.project_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_invites.project_id
      AND project_members.user_id = auth.uid()
    )
  );

-- Política: Apenas admin/tech_lead podem criar convites
CREATE POLICY "Admins and tech leads can create invites"
  ON public.project_invites
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_invites.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('admin', 'tech_lead')
    )
  );

-- Política: Apenas quem criou ou admin/tech_lead podem atualizar
CREATE POLICY "Invite creators and admins can update invites"
  ON public.project_invites
  FOR UPDATE
  USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_invites.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('admin', 'tech_lead')
    )
  );

-- Política: Apenas quem criou ou admin/tech_lead podem deletar
CREATE POLICY "Invite creators and admins can delete invites"
  ON public.project_invites
  FOR DELETE
  USING (
    invited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_members
      WHERE project_members.project_id = project_invites.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('admin', 'tech_lead')
    )
  );

-- Política pública: Qualquer um pode ver convites por token (para aceitação)
CREATE POLICY "Anyone can view invite by token"
  ON public.project_invites
  FOR SELECT
  USING (true);
