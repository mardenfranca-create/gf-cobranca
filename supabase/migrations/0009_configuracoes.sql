-- gf-cobranca · configurações do sistema (chave/valor) e pausa geral da régua automática
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

create table if not exists configuracoes (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_por text,
  atualizado_em  timestamptz not null default now()
);
alter table configuracoes enable row level security;
drop policy if exists configuracoes_equipe_sel on configuracoes;
create policy configuracoes_equipe_sel on configuracoes for select using (e_equipe());
drop policy if exists configuracoes_admin on configuracoes;
create policy configuracoes_admin on configuracoes for all using (meu_papel() = 'admin') with check (meu_papel() = 'admin');

-- Régua automática nasce PAUSADA. Só o admin liga, pela tela Painel.
insert into configuracoes (chave, valor) values ('regua_pausada', 'true') on conflict (chave) do nothing;
