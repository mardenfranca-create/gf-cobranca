-- gf-cobranca · agenda de contatos (todo número conhecido do escritório, com nome)
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

create table if not exists contatos (
  telefone      text primary key,                 -- E.164 sem +, forma canônica (celular BR com o nono dígito)
  nome          text not null,
  origem        text not null default 'importacao', -- importacao | manual | whatsapp
  etiquetas     text[] not null default '{}',     -- ex.: {cobranca, lobe, equipe}
  observacao    text,
  criado_por    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contatos_nome on contatos (lower(nome));
drop trigger if exists contatos_atualizado on contatos;
create trigger contatos_atualizado before update on contatos for each row execute function toca_atualizado_em();
alter table contatos enable row level security;
drop policy if exists contatos_equipe on contatos;
create policy contatos_equipe on contatos for all using (e_equipe()) with check (e_equipe());
