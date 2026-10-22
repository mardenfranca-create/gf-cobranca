-- 0011: edição de parcelas pela mesa.
-- O cliente credor muitas vezes avisa que uma competência já foi paga ou pede para não cobrar
-- determinada parcela. Em vez de apagar a linha (a próxima importação da planilha a recriaria,
-- porque a reconciliação só olha referência + vencimento), a parcela ganha uma situação:
--   aberta   -> paga = false e retirada_em nulo (em cobrança)
--   paga     -> paga = true, paga_em preenchido
--   retirada -> retirada_em preenchido (fora da cobrança a pedido do cliente; o motivo fica no caso)
-- O valor em aberto do caso passa a ser a soma das parcelas abertas (src/lib/domain/parcelas.ts).

alter table parcelas add column if not exists retirada_em     date;
alter table parcelas add column if not exists retirada_motivo text;

alter table parcelas drop constraint if exists parcela_paga_ou_retirada;
alter table parcelas add constraint parcela_paga_ou_retirada
  check (not (paga and retirada_em is not null));

comment on column parcelas.retirada_em     is 'Data em que a parcela saiu da cobrança a pedido do cliente (não é paga nem aberta).';
comment on column parcelas.retirada_motivo is 'Por que saiu da cobrança (o cliente vê no histórico do caso).';
