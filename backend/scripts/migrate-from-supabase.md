# Migração do Supabase -> Postgres local

## Pré-requisitos

- Ter o Postgres local rodando (já está via `docker compose up -d db`).
- Ter um arquivo de dump do Supabase (preferencialmente **custom format**):
  - `supabase.dump` (recomendado) ou
  - `supabase.sql` (texto)

> Observação: para migrar **usuários**, precisamos também exportar a tabela `auth.users` do Supabase.

## 1) Exportar do Supabase

### Opção A (recomendada): `pg_dump` em formato custom

```bash
# Schema + data do public
pg_dump --format=custom --no-owner --no-privileges \
  --schema=public \
  --file supabase-public.dump \
  "$SUPABASE_DATABASE_URL"

# Somente auth.users
pg_dump --format=custom --no-owner --no-privileges \
  --schema=auth --table=auth.users \
  --file supabase-auth-users.dump \
  "$SUPABASE_DATABASE_URL"
```

### Opção B: SQL

```bash
pg_dump --format=plain --no-owner --no-privileges \
  --schema=public \
  --file supabase-public.sql \
  "$SUPABASE_DATABASE_URL"

pg_dump --format=plain --no-owner --no-privileges \
  --schema=auth --table=auth.users \
  --file supabase-auth-users.sql \
  "$SUPABASE_DATABASE_URL"
```

## 2) Importar no Postgres local

### Para dumps `.dump`

```bash
# Public
pg_restore --no-owner --no-privileges \
  --dbname "postgres://neurelix:neurelix@localhost:5432/neurelix" \
  --clean --if-exists \
  supabase-public.dump

# auth.users (mantendo ids)
pg_restore --no-owner --no-privileges \
  --dbname "postgres://neurelix:neurelix@localhost:5432/neurelix" \
  --clean --if-exists \
  supabase-auth-users.dump
```

### Para SQL

```bash
psql "postgres://neurelix:neurelix@localhost:5432/neurelix" -f supabase-public.sql
psql "postgres://neurelix:neurelix@localhost:5432/neurelix" -f supabase-auth-users.sql
```

## 3) Ajustes pós-migração

- Verificar contagens:

```sql
select count(*) from auth.users;
select count(*) from public.profiles;
select count(*) from public.projects;
```

- Se necessário, reexecutar a criação de perfis faltantes (dependendo do que veio do Supabase).

