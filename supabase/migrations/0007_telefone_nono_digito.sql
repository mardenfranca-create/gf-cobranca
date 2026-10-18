-- gf-cobranca · WhatsApp: nono dígito
-- Reexecutável: pode ser colado e rodado de novo sem erro e sem perder dados.

-- A Meta entrega o número do devedor sem o nono dígito (556284077891) quando o WhatsApp dele foi criado
-- antes da mudança da Anatel; o sistema envia com o 9 (5562984077891). O código passou a canonizar
-- tudo com o 9; aqui corrigimos as mensagens já gravadas para a mesma pessoa virar uma conversa só.
update mensagens
   set telefone = '55' || substr(telefone, 3, 2) || '9' || substr(telefone, 5)
 where telefone ~ '^55[1-9]{2}[6-9][0-9]{7}$';
