-- gf-cobranca · lote 2: log de acesso (quem entrou, quando, de onde)
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

create table if not exists acessos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text not null,
  nome        text,
  papel       text,                                 -- admin | operador | cliente (cópia no momento do acesso)
  resultado   text not null check (resultado in ('ok','falha')),
  motivo      text,                                 -- código do erro quando falha (invalid_credentials, ...)
  ip          text,
  cidade      text,                                 -- x-vercel-ip-city / region / country
  user_agent  text,
  criado_em   timestamptz not null default now()
);
create index if not exists acessos_criado on acessos (criado_em desc);
create index if not exists acessos_email on acessos (email, criado_em desc);

alter table acessos enable row level security;
-- admin lê tudo; cada usuário pode gravar o próprio acesso (a falha de login é gravada pelo servidor com a chave de serviço).
drop policy if exists acessos_admin_sel on acessos;
create policy acessos_admin_sel on acessos for select using (meu_papel() = 'admin');
drop policy if exists acessos_self_ins on acessos;
create policy acessos_self_ins on acessos for insert with check (user_id = auth.uid());
-- Log é imutável.
drop trigger if exists acessos_imutaveis on acessos;
create trigger acessos_imutaveis before update or delete on acessos
  for each row execute function bloqueia_alteracao_evento();
