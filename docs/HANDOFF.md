# gf-cobranca · passagem de bastão (19/10/2026)

Resumo para continuar o trabalho numa sessão local do Claude Code. Leia este arquivo e o README antes de mexer.

## O que o sistema faz hoje (em produção em https://gf-cobranca.vercel.app)

- **Mesa de operação**: fila do dia, agenda, quadro, casos, conferência, clientes, importar, equipe, busca global, troca de senha. Regra de ouro no banco: caso aberto sempre tem responsável, próxima ação e data.
- **Portal do cliente**: visão geral, carteira, caso, aprovações de proposta, planilha, alçadas, **relatório mensal em PDF com timbrado** (`/portal/relatorio`, gerador próprio em `src/lib/pdf.ts`).
- **Painel do admin** (`/painel`): recuperado por mês e por cliente, taxa de acordo, tempo até o pagamento, carteira parada > 60 dias, produtividade por pessoa, **log de acesso** (`/painel/acessos`).
- **Asaas** (chave sandbox): boleto/Pix pelo caso, parcelas de acordo, baixa automática por webhook. Virada para produção pendente (checklist no README; zerar `casos.asaas_customer_id`).
- **WhatsApp oficial (Meta Cloud API)**: número registrado, WABA assinada, webhook verificado, 5 modelos cadastrados (`gf_lembrete_1`, `gf_lembrete_2`, `gf_boleto`, `gf_vencimento`, `gf_acordo_quebrado`; os modelos 2 a 5 começam com "Olá, {{1}}."). Envio manual pelo caso e pela **aba WhatsApp** (caixa de entrada: conversas por número, resposta livre em 24h, modelo fora da janela, vínculo de número sem caso, agenda de contatos). Nono dígito canonizado.
- **Importar telefones de contatos** (Importar → Telefones a partir de contatos): aceita exportação do Digisac (83 arquivos) ou do Google Contatos (arquivo consolidado com 7.294 contatos), cruza com os casos por telefone e nome, grava telefones e a **agenda de contatos**.
- **Cron da régua** (Vercel, dias úteis 9h Brasília): 1º e 2º lembrete para casos em "Régua automática" e lembrete de parcela de acordo. Só envia com `WHATSAPP_REGUA_AUTOMATICA=true` na Vercel **e** (após o PR #22) régua ligada no Painel.

## Incidente de 19/10 (pendente de tratamento)

Às 9h o cron enviou lembretes reais para 12 devedores da carteira **Lobe Juros e Multa** porque `WHATSAPP_REGUA_AUTOMATICA` estava `true` em produção. Cinco responderam confusos ("juros de quê?", "não devo nada"). Causa secundária: a mensagem diz "em nome de Lobe Juros" (nome curto do cliente), que o devedor não reconhece.
- Responder as conversas pela aba WhatsApp dentro da janela de 24h (texto sugerido na conversa da sessão anterior: pedido de desculpa pelo disparo antes da hora, explicação de que se trata de juros e multa apurados pela Lobe Contabilidade, promessa de demonstrativo).
- Quem contestou: registrar contato e marcar exceção "Dívida contestada" até a Lobe confirmar.
- Antes de religar a régua: ajustar o nome curto do cliente em Clientes para o nome que o devedor conhece, revisar a referência dos casos dessa carteira.

## PRs abertos (mergear nesta ordem)

1. **#22 Pausa da régua no Painel** — migration `0009_configuracoes.sql`. A régua nasce pausada no banco; botão Ligar/Pausar no Painel; cron só envia com as duas travas. **Mergear primeiro e rodar a 0009 hoje**, para o cron de amanhã só simular.
2. **#23 Notificação extrajudicial** — migration `0010_notificacoes.sql`. Minuta gerada do caso → revisão do advogado (`/notificacoes`) → aprovar → enviar por WhatsApp com PDF anexo (modelo `gf_notificacao`, cabeçalho de documento) ou registrar envio por correio/e-mail. Precisa de `APP_URL` na Vercel. Pode haver conflito trivial em `database.types.ts` e `README.md` com o #22 (ambos adicionam linhas nas mesmas listas): manter as duas.

## Pendências do Marden (fora do código)

- Supabase (SQL Editor), conferir se já rodaram: `0004_whatsapp`, `0005_acessos`, `0006_whatsapp_inbox`, `0007_telefone_nono_digito`, `0008_contatos`; depois `0009_configuracoes` e `0010_notificacoes`. Todas reexecutáveis.
- Vercel: `WHATSAPP_REGUA_AUTOMATICA=false` (segurança dupla) e `APP_URL=https://gf-cobranca.vercel.app`; Redeploy. Opcional: `RELATORIO_RODAPE` (endereço/OAB no rodapé dos PDFs).
- Meta: cadastrar `gf_notificacao` (cabeçalho documento, texto no README) e, para iniciar conversa com quem não é devedor, um modelo genérico `gf_contato` ("Olá, {{1}}. Aqui é o Gontijo Freitas Advogados. Podemos falar por aqui?").
- Importar os contatos (arquivo consolidado do Google ou os 83 do Digisac, que trazem o departamento) com a Ana Paula ao lado para resolver os ambíguos.
- Domínio `cobranca.gontijofreitas.adv.br` na Vercel (CNAME) + URLs no Supabase Auth; depois trocar a URL do webhook da Meta.
- Conversa com a Ana Paula (ter/qua) e só então ligar a régua: Painel → Ligar, com `/api/cron/regua?simular=1` conferido antes.

## Próximos projetos (não iniciados)

- **Nova conversa** na aba WhatsApp (depende do modelo `gf_contato` aprovado).
- **Nibo**: API REST oficial (plano Premium do cliente), base `https://api.nibo.com.br/empresas/v1/`, token no cabeçalho `ApiToken`, contas a receber em `/schedules/credit`, clientes em `/customers`, OData (`$filter`, `$orderby`, `$top`, `$skip`, 500/página), `updateDate` para incremental. Não confirmei webhooks: planejar cron horário. Desenho: cron lê títulos vencidos → cria/consolida casos (mesma reconciliação da planilha) → título recebido no Nibo encerra caso/parcela. Token por cliente, só no servidor. Confirmar endpoints na documentação oficial (developer.nibo.com.br / nibo.readme.io) com o token em mãos.
- **Digisac**: descartado como canal (a Meta direta já está no ar); só a exportação de contatos foi aproveitada.
- Lotes 3 e 4 propostos: split Asaas, honorários por caso, restringir colunas do cliente via API, backup, mensagens de erro amigáveis.
- Virada do Asaas para produção.

## Como trabalhar

- Branch por tarefa a partir de `main`, PR em draft, Marden mergeia. Antes de push: `npx next typegen && npm run typecheck && npm run lint && npx vitest run && npm run build`.
- Migrations sempre reexecutáveis, testadas duas vezes num Postgres local.
- Chaves nunca pelo chat: Marden cadastra na Vercel/Supabase/Meta.
- Regras puras em `src/lib/domain` com testes (72 hoje); ações em `src/lib/actions`; telas em `src/app`.
