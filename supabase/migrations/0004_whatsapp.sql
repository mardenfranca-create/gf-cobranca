-- gf-cobranca · etapa 3b: WhatsApp oficial (Meta Cloud API)
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

-- ---------- opt-out do devedor (respondeu SAIR) ----------
alter table casos add column if not exists wa_optout boolean not null default false;

-- ---------- mensagens enviadas e recebidas ----------
create table if not exists mensagens (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid not null references casos(id) on delete cascade,
  direcao       text not null check (direcao in ('saida','entrada')),
  canal         text not null default 'whatsapp',
  telefone      text not null,                       -- E.164 sem +, ex.: 5562999998888
  template      text,                                -- nome do modelo aprovado na Meta (saída)
  texto         text not null,                       -- texto renderizado (saída) ou recebido (entrada)
  wa_id         text unique,                         -- id da mensagem na Meta (wamid...)
  status        text not null default 'queued',      -- queued, sent, delivered, read, failed, received
  erro          text,
  origem        text not null default 'manual',      -- manual, regua, asaas, cron, webhook
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists mensagens_caso on mensagens (caso_id, criado_em desc);
create index if not exists mensagens_template on mensagens (caso_id, template);
drop trigger if exists mensagens_atualizado on mensagens;
create trigger mensagens_atualizado before update on mensagens for each row execute function toca_atualizado_em();
alter table mensagens enable row level security;
drop policy if exists mensagens_equipe on mensagens;
create policy mensagens_equipe on mensagens for all using (e_equipe()) with check (e_equipe());
drop policy if exists mensagens_cliente_sel on mensagens;
create policy mensagens_cliente_sel on mensagens for select using (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));
