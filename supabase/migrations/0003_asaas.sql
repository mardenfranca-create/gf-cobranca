-- gf-cobranca · etapa 3a: integração Asaas (boleto/Pix e baixa automática por webhook)
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

-- ---------- devedor como cliente no Asaas ----------
alter table casos add column if not exists asaas_customer_id text;

-- ---------- cobranças emitidas (uma linha por boleto/Pix) ----------
create table if not exists cobrancas (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid not null references casos(id) on delete cascade,
  asaas_id      text not null unique,                 -- pay_xxx
  tipo          text not null check (tipo in ('integral','entrada','parcela','avulsa')),
  parcela_n     int,
  parcelas      int,
  valor         numeric(12,2) not null,
  vencimento    date not null,
  status        text not null default 'PENDING',      -- PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, DELETED, ...
  invoice_url   text,
  boleto_url    text,
  pix_copia     text,
  valor_pago    numeric(12,2),
  pago_em       timestamptz,
  criado_por    text not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists cobrancas_caso on cobrancas (caso_id, vencimento);
drop trigger if exists cobrancas_atualizado on cobrancas;
create trigger cobrancas_atualizado before update on cobrancas for each row execute function toca_atualizado_em();
alter table cobrancas enable row level security;
drop policy if exists cobrancas_equipe on cobrancas;
create policy cobrancas_equipe on cobrancas for all using (e_equipe()) with check (e_equipe());
drop policy if exists cobrancas_cliente_sel on cobrancas;
create policy cobrancas_cliente_sel on cobrancas for select using (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));

-- ---------- eventos recebidos do webhook (idempotência e auditoria) ----------
create table if not exists asaas_eventos (
  id           text primary key,                      -- evt_xxx enviado pelo Asaas
  evento       text not null,
  payment_id   text,
  payload      jsonb not null,
  resultado    text,
  recebido_em  timestamptz not null default now()
);
alter table asaas_eventos enable row level security;
drop policy if exists asaas_eventos_equipe on asaas_eventos;
create policy asaas_eventos_equipe on asaas_eventos for select using (e_equipe());
