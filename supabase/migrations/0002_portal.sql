-- gf-cobranca · etapa 2: portal do cliente
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.
-- O que muda: (1) registro imutável de ajustes de alçada/contato feitos pelo cliente ou pelo admin;
-- (2) o cliente passa a poder abrir casos da própria carteira por planilha (insert restrito ao seu cliente_id);
-- (3) o cliente lê a régua (só leitura) para o portal mostrar prazos coerentes com a mesa.

-- ---------- registro de ajustes (quem mudou o quê, quando) ----------
create table if not exists ajustes_cliente (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  text not null references clientes(id),
  autor       text not null,
  autor_id    uuid,
  campo       text not null,                      -- 'limites', 'contato', 'honorarios', 'protesto_dias'
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);
create index if not exists ajustes_cliente_idx on ajustes_cliente (cliente_id, criado_em desc);
alter table ajustes_cliente enable row level security;
drop policy if exists ajustes_sel on ajustes_cliente;
create policy ajustes_sel on ajustes_cliente for select using (e_equipe() or cliente_id = meu_cliente());
drop policy if exists ajustes_ins on ajustes_cliente;
create policy ajustes_ins on ajustes_cliente for insert with check (e_equipe() or cliente_id = meu_cliente());
drop trigger if exists ajustes_imutaveis on ajustes_cliente;
create trigger ajustes_imutaveis before update or delete on ajustes_cliente
  for each row execute function bloqueia_alteracao_evento();

-- ---------- o cliente abre casos da própria carteira (planilha pelo portal) ----------
drop policy if exists casos_cliente_ins on casos;
create policy casos_cliente_ins on casos for insert with check (cliente_id = meu_cliente());
drop policy if exists parcelas_cliente_ins on parcelas;
create policy parcelas_cliente_ins on parcelas for insert with check (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));
drop policy if exists importacoes_cliente_ins on importacoes;
create policy importacoes_cliente_ins on importacoes for insert with check (cliente_id = meu_cliente());

-- ---------- régua visível (só leitura) para o cliente ----------
drop policy if exists regua_cliente_sel on regua;
create policy regua_cliente_sel on regua for select using (meu_papel() = 'cliente');
