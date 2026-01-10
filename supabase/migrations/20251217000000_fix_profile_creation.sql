-- Migração: Correção de criação automática de perfis
-- Corrige trigger e cria perfis para usuários existentes

-- ============================================================
-- 1. MELHORAR FUNÇÃO handle_new_user()
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id, 
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      SPLIT_PART(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. CRIAR TRIGGER SE NÃO EXISTIR
-- ============================================================

-- Remover trigger existente se houver (para recriar)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Criar trigger que chama handle_new_user() quando um novo usuário é criado
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. CRIAR PERFIS PARA USUÁRIOS EXISTENTES SEM PERFIL
-- ============================================================

-- Criar perfis para usuários existentes sem perfil
INSERT INTO public.profiles (user_id, full_name)
SELECT 
  id,
  COALESCE(
    raw_user_meta_data->>'full_name',
    SPLIT_PART(email, '@', 1)
  ) as full_name
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.profiles)
ON CONFLICT (user_id) DO NOTHING;

