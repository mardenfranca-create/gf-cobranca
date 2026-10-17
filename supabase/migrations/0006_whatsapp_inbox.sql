-- gf-cobranca · caixa de entrada do WhatsApp na mesa
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

-- Mensagem recebida de número que ainda não tem caso fica guardada sem caso, para a equipe vincular depois.
alter table mensagens alter column caso_id drop not null;

-- Leitura pela equipe (indicador de "não lida" na caixa de entrada).
alter table mensagens add column if not exists lida_em timestamptz;
alter table mensagens add column if not exists lida_por text;

create index if not exists mensagens_telefone on mensagens (telefone, criado_em desc);
create index if not exists mensagens_nao_lidas on mensagens (criado_em desc) where direcao = 'entrada' and lida_em is null;
