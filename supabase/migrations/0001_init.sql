-- gf-cobranca · schema inicial
-- Regra de ouro (no banco, não na tela): nenhum caso aberto sem responsável, próxima ação e data.
-- Eventos são imutáveis. Importações são idempotentes por hash.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type papel as enum ('admin', 'operador', 'cliente');
create type fase as enum ('regua', 'neg', 'acordo', 'quebra', 'analise', 'protesto', 'judicial', 'confirma', 'pago', 'devolvido');
create type tipo_followup as enum ('notif', 'promessa', 'recontatar', 'acordo', 'judicial', 'decidir');
create type tipo_excecao as enum ('nao_cobrar', 'sem_contrato', 'aguardando', 'negociando', 'contestacao', 'prescrito');
create type status_proposta as enum ('pending', 'approved', 'rejected', 'closed');

-- ---------- clientes credores ----------
create table clientes (
  id          text primary key,                 -- slug estável: 'wrj', 'lobe', 'recmed'
  nome        text not null,
  nome_curto  text not null,
  tipo        text not null check (tipo in ('escola','contab','b2b','assoc')),
  limites     jsonb not null default '{"desc":20,"parc":10,"ent":10,"min":250}',
  honorarios  jsonb not null default '{"extra":20,"jud":25}',
  protesto_dias int not null default 45,
  contato     text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------- perfis (1:1 com auth.users) ----------
create table perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  papel       papel not null default 'operador',
  cliente_id  text references clientes(id),      -- obrigatório quando papel = 'cliente'
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  constraint perfil_cliente_coerente check ((papel = 'cliente') = (cliente_id is not null))
);

-- ---------- régua (global; etapa 3 permite por cliente) ----------
create table regua (
  chave   text primary key,
  rotulo  text not null,
  dias    int not null check (dias >= 0),
  nota    text not null,
  ordem   int not null
);
insert into regua (chave, rotulo, dias, nota, ordem) values
 ('notif1',     'Primeira notificação após o vencimento identificado',          1,  'Enviar primeira notificação (régua automática)', 1),
 ('cobranca',   'Cobrança humana, se a régua não resolver',                     11, 'Fim da régua automática: primeiro contato humano', 2),
 ('recontato',  'Novo contato quando não há resposta',                          5,  'Recontatar o devedor', 3),
 ('notifExtra', 'Prazo da notificação extrajudicial',                           15, 'Fim do prazo da notificação extrajudicial', 4),
 ('acordoConf', 'Conferência de parcela de acordo',                             30, 'Conferir parcela do acordo', 5),
 ('quebra',     'Decisão após acordo quebrado',                                 2,  'Renegociar ou protestar', 6),
 ('analise',    'Decisão de judicializar ou devolver',                          15, 'Decidir: judicializar ou devolver', 7),
 ('protesto',   'Prazo do protesto em cartório',                                10, 'Fim do prazo do protesto em cartório', 8),
 ('judicial',   'Conferência de andamento judicial',                            90, 'Conferir andamento no Astrea', 9),
 ('excecao',    'Revisão de exceção (não cobrar, aguardando orientação)',       30, 'Revisar exceção', 10);

-- ---------- casos (uma dívida consolidada por cliente + devedor) ----------
create table casos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      text not null references clientes(id),
  devedor         text not null,
  documento       text,                             -- CPF/CNPJ formatado
  documento_digits text generated always as (regexp_replace(coalesce(documento,''), '\D', '', 'g')) stored,
  referencia      text not null default 'Título em cobrança',
  detalhe         text,
  valor_original  numeric(14,2),
  valor_atualizado numeric(14,2),
  valor_fonte     text,
  fase            fase not null default 'regua',
  fase_nota       text,
  responsavel     text,
  -- próxima ação obrigatória
  proxima_data    date,
  proxima_tipo    tipo_followup,
  proxima_nota    text,
  proxima_auto    boolean not null default true,
  -- exceção (pausa a régua sem tirar o caso da agenda)
  exc_tipo        tipo_excecao,
  exc_motivo      text,
  exc_desde       date,
  exc_revisao     date,
  telefone        text,
  email           text,
  processo        text,
  acordo          jsonb,                            -- {parc, paid, next}
  origem          jsonb,                            -- {trello_url, trello_list, etiquetas}
  pendencias      text[] not null default '{}',
  entrada_em      date not null default current_date,
  ultima_mov_em   timestamptz not null default now(),
  encerrado_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  -- REGRA DE OURO: caso aberto exige responsável + próxima ação + data
  constraint caso_aberto_tem_proxima_acao check (
    fase in ('pago','devolvido')
    or (responsavel is not null and proxima_data is not null and proxima_tipo is not null and proxima_nota is not null)
  ),
  constraint excecao_coerente check (
    (exc_tipo is null and exc_desde is null and exc_revisao is null)
    or (exc_tipo is not null and exc_desde is not null and exc_revisao is not null)
  ),
  constraint caso_encerrado_tem_data check ((fase in ('pago','devolvido')) = (encerrado_em is not null))
);
create index casos_cliente_fase on casos (cliente_id, fase);
create index casos_proxima on casos (proxima_data) where fase not in ('pago','devolvido');
-- cadastro único: um caso ABERTO por cliente + documento
create unique index casos_unico_aberto on casos (cliente_id, documento_digits)
  where fase not in ('pago','devolvido') and documento_digits <> '';

-- ---------- parcelas consolidadas no caso ----------
create table parcelas (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references casos(id) on delete cascade,
  referencia  text not null,
  competencia text,
  valor       numeric(14,2) not null check (valor > 0),
  vencimento  date not null,
  paga        boolean not null default false,
  paga_em     date,
  criado_em   timestamptz not null default now(),
  unique (caso_id, referencia, vencimento)         -- idempotência: a mesma parcela não entra duas vezes
);

-- ---------- eventos (histórico imutável) ----------
create table eventos (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references casos(id) on delete cascade,
  data           timestamptz not null default now(),
  autor          text not null,
  autor_id       uuid references auth.users(id),
  tipo           text not null,                    -- contato, proposta, acordo, protesto, judicial, pagamento, excecao, importacao, sistema
  texto          text not null,
  visivel_cliente boolean not null default true,
  dados          jsonb
);
create index eventos_caso_data on eventos (caso_id, data desc);

create or replace function bloqueia_alteracao_evento() returns trigger language plpgsql as $$
begin
  raise exception 'Eventos são imutáveis. Registre um novo evento em vez de alterar ou apagar.';
end $$;
create trigger eventos_imutaveis before update or delete on eventos
  for each row execute function bloqueia_alteracao_evento();

-- ---------- propostas de acordo ----------
create table propostas (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid not null references casos(id) on delete cascade,
  desconto_pct  numeric(5,2) not null,
  parcelas      int not null,
  entrada_pct   numeric(5,2) not null,
  total         numeric(14,2) not null,
  nota          text,
  fora_alcada   boolean not null,
  status        status_proposta not null default 'pending',
  enviada_em    timestamptz not null default now(),
  decidida_por  text,
  decidida_em   timestamptz
);

-- ---------- importações (idempotentes) ----------
create table importacoes (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  text references clientes(id),
  origem      text not null,                       -- 'planilha' | 'trello'
  arquivo     text not null,
  hash        text not null,
  linhas      int not null,
  resumo      jsonb not null,                      -- {novos, consolidados, baixas, excecoes, ausentes, erros}
  criado_por  text not null,
  criado_em   timestamptz not null default now(),
  unique (hash)                                    -- a mesma planilha enviada duas vezes não gera nada
);

-- ---------- atualizado_em ----------
create or replace function toca_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger casos_atualizado before update on casos for each row execute function toca_atualizado_em();

-- ---------- helpers de autorização ----------
create or replace function meu_papel() returns papel language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo
$$;
create or replace function meu_cliente() returns text language sql stable security definer set search_path = public as $$
  select cliente_id from perfis where id = auth.uid() and ativo
$$;
create or replace function e_equipe() returns boolean language sql stable as $$
  select meu_papel() in ('admin','operador')
$$;

-- ---------- RLS ----------
alter table clientes    enable row level security;
alter table perfis      enable row level security;
alter table regua       enable row level security;
alter table casos       enable row level security;
alter table parcelas    enable row level security;
alter table eventos     enable row level security;
alter table propostas   enable row level security;
alter table importacoes enable row level security;

-- perfis: cada um lê o próprio; admin lê e gerencia todos
create policy perfis_self on perfis for select using (id = auth.uid() or meu_papel() = 'admin');
create policy perfis_admin on perfis for all using (meu_papel() = 'admin') with check (meu_papel() = 'admin');

-- clientes: equipe lê e admin edita; cliente lê só o seu
create policy clientes_equipe_sel on clientes for select using (e_equipe() or id = meu_cliente());
create policy clientes_admin_mod on clientes for all using (meu_papel() = 'admin') with check (meu_papel() = 'admin');
-- cliente pode ajustar as próprias alçadas (coluna limites) — controlado pela server action
create policy clientes_cliente_upd on clientes for update using (id = meu_cliente()) with check (id = meu_cliente());

-- régua: equipe lê, admin edita
create policy regua_sel on regua for select using (e_equipe());
create policy regua_admin on regua for all using (meu_papel() = 'admin') with check (meu_papel() = 'admin');

-- casos: equipe tudo; cliente lê os seus e só altera o que a server action permitir (informar pagamento)
create policy casos_equipe on casos for all using (e_equipe()) with check (e_equipe());
create policy casos_cliente_sel on casos for select using (cliente_id = meu_cliente());
create policy casos_cliente_upd on casos for update using (cliente_id = meu_cliente()) with check (cliente_id = meu_cliente());

create policy parcelas_equipe on parcelas for all using (e_equipe()) with check (e_equipe());
create policy parcelas_cliente on parcelas for select using (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));

-- eventos: inserção por equipe e cliente; leitura do cliente só do que é visível
create policy eventos_equipe_sel on eventos for select using (e_equipe());
create policy eventos_equipe_ins on eventos for insert with check (e_equipe());
create policy eventos_cliente_sel on eventos for select using (visivel_cliente and exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));
create policy eventos_cliente_ins on eventos for insert with check (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));

create policy propostas_equipe on propostas for all using (e_equipe()) with check (e_equipe());
create policy propostas_cliente_sel on propostas for select using (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));
create policy propostas_cliente_upd on propostas for update using (exists (select 1 from casos c where c.id = caso_id and c.cliente_id = meu_cliente()));

create policy importacoes_equipe on importacoes for all using (e_equipe()) with check (e_equipe());
create policy importacoes_cliente on importacoes for select using (cliente_id = meu_cliente());

-- ---------- perfil automático ao criar usuário ----------
-- O admin convida pelo painel do Supabase (Authentication → Users → Invite) informando user_metadata {"nome":"...","papel":"operador"}.
create or replace function cria_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, papel, cliente_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'papel')::papel, 'operador'),
    nullif(new.raw_user_meta_data->>'cliente_id', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function cria_perfil();
