-- gf-cobranca · notificações extrajudiciais: minuta gerada do caso, revisão do advogado, envio pelo sistema
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

create table if not exists notificacoes (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid not null references casos(id) on delete cascade,
  status        text not null default 'minuta' check (status in ('minuta','aprovada','enviada','cancelada')),
  titulo        text not null,
  corpo         text not null,                       -- texto da notificação, parágrafos separados por linha em branco
  prazo_dias    int not null default 10,
  advogado      text,                                -- quem assina
  oab           text,
  revisor       text,                                -- quem deve revisar (nome da equipe)
  gerada_por    text not null,
  aprovada_por  text,
  aprovada_em   timestamptz,
  enviada_por   text,
  enviada_em    timestamptz,
  canal         text,                                -- whatsapp | email | correio | pessoalmente | outro
  rastreio      text,                                -- código de AR, wamid, observação
  token         text not null default encode(gen_random_bytes(18), 'hex'), -- link público do PDF (Meta precisa baixar)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists notificacoes_caso on notificacoes (caso_id, criado_em desc);
create index if not exists notificacoes_status on notificacoes (status, criado_em desc);
drop trigger if exists notificacoes_atualizado on notificacoes;
create trigger notificacoes_atualizado before update on notificacoes for each row execute function toca_atualizado_em();
alter table notificacoes enable row level security;
drop policy if exists notificacoes_equipe on notificacoes;
create policy notificacoes_equipe on notificacoes for all using (e_equipe()) with check (e_equipe());
drop policy if exists notificacoes_cliente_sel on notificacoes;
create policy notificacoes_cliente_sel on notificacoes for select using (status = 'enviada' and exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));
