# gf-cobranca

Sistema de recuperação de crédito da Gontijo Freitas Advogados: mesa de operação (equipe) e portal do cliente.

**Regra de ouro, no banco:** nenhum caso aberto sem responsável, próxima ação e data. Eventos são imutáveis. Importações são idempotentes.

## Stack

Next.js 16 (App Router, Server Actions) · Supabase (Postgres, Auth, RLS) · Vercel.

## Etapas

| Etapa | Conteúdo | Status |
|---|---|---|
| 1. Núcleo | Login da equipe, casos, régua configurável, fila, agenda, quadro, exceções, importação com reconciliação, carga do Trello | em produção |
| 2. Portal do cliente | Login por cliente, visão geral, carteira, aprovação de propostas fora da alçada, envio de planilha, informar pagamento, alçadas com registro de alteração | nesta versão |
| 3. Integrações | Asaas (boleto/Pix e baixa automática): em produção. **WhatsApp oficial (Meta Cloud API): nesta versão.** Split e exportação do Astrea: a seguir | em andamento |
| 4. Financeiro | Fechamento de êxito, comissão, conciliação | |

## Colocar no ar (primeira vez)

### 1. Banco (Supabase)

1. Projeto Supabase na região **South America (São Paulo)**.
2. No painel: **SQL Editor → New query**, cole o conteúdo de `supabase/migrations/0001_init.sql` e execute. Depois faça o mesmo com `0002_portal.sql` (etapa 2), `0003_asaas.sql` (etapa 3), `0004_whatsapp.sql` (WhatsApp), `0005_acessos.sql` (log de acesso), `0006_whatsapp_inbox.sql` (caixa de entrada) , `0007_telefone_nono_digito.sql` (nono dígito), `0008_contatos.sql` (agenda de contatos), `0009_configuracoes.sql` (pausa da régua) e `0010_notificacoes.sql` (notificações extrajudiciais). As migrations são reexecutáveis: rodar de novo não apaga nada.
3. **Authentication → Providers → Email**: deixe "Confirm email" desligado (os usuários são criados pelo admin, não se cadastram).
4. **Project Settings → API**: anote `Project URL`, `anon public` e `service_role`.

### 2. Usuários

**Authentication → Users → Add user → Create new user**, com e-mail e senha. Em *User Metadata* informe o perfil:

```json
{"nome": "Ana Paula", "papel": "operador"}
```

Papéis: `admin` (Marden, Letícia), `operador` (Ana Paula), `cliente`. O perfil é criado automaticamente junto com o usuário.

Para um usuário do **portal do cliente**, o `cliente_id` é o id do credor como aparece em Clientes (ex.: `wrj`, `lobe`, `recmed`):

```json
{"nome": "Financeiro WRJ", "papel": "cliente", "cliente_id": "wrj"}
```

Esse usuário só enxerga e só alcança a própria carteira (RLS no banco). Se o usuário já existia, ajuste pelo SQL Editor:

```sql
update perfis p set nome = 'Financeiro WRJ', papel = 'cliente', cliente_id = 'wrj'
from auth.users u where u.id = p.id and u.email = 'financeiro@wrj.com.br';
```

### 3. Aplicação (Vercel)

1. **Add New Project → Import** este repositório.
2. Em *Environment Variables*, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (só servidor)
   - `ASAAS_API_KEY`, `ASAAS_ENV`, `ASAAS_WEBHOOK_TOKEN` (etapa 3, ver seção Asaas)
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_REGUA_AUTOMATICA`, `CRON_SECRET`, opcional `WHATSAPP_WABA_ID` (etapa 3, ver seção WhatsApp)
3. Deploy. Abra a URL e entre com um usuário da equipe.

### 4. Carga da carteira do Trello

Pela interface: **Importar → Recarregar do Trello** e escolha o JSON exportado (Menu do quadro → Imprimir, exportar e compartilhar → Exportar como JSON).

Ou pela linha de comando, com a chave de serviço:

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run carga:trello -- trello.json
```

A carga é idempotente: rodar de novo só traz cartões novos.

## Desenvolvimento local

```bash
cp .env.example .env.local   # preencha com as chaves do Supabase
npm install
npm run dev                  # http://localhost:3000
npm test                     # regras de negócio (régua, fila, reconciliação, alçada)
npm run lint && npm run typecheck
```

## Estrutura

```
supabase/migrations/   schema, RLS, triggers (eventos imutáveis, perfil automático)
src/lib/domain/        regras puras, testadas: régua, fila, reconciliação, alçada, parser do Trello
src/lib/actions/       server actions: cada ação da mesa grava o caso + evento
src/app/(mesa)/        fila, agenda, quadro, casos, conferência, clientes, importar
src/app/portal/        portal do cliente: visão geral, carteira, caso, aprovações, relatório mensal, planilha, alçadas
src/lib/pdf.ts         gerador de PDF sem dependências (texto, linhas, tabelas) usado pelo relatório mensal
src/proxy.ts           renova a sessão e protege rotas
scripts/               carga inicial
```

### Novo caso sem planilha

Em **Casos → Novo caso**, a equipe cadastra um devedor avulso (cliente, devedor, CPF/CNPJ, referência, valor, vencimento, celular, e-mail, responsável). A validação e a gravação são as mesmas da planilha (`src/lib/abertura-caso.ts`): o caso nasce na régua automática com parcela e evento, e o mesmo CPF/CNPJ com caso aberto no cliente recebe a parcela no caso existente em vez de duplicar. Sem celular válido o caso abre, mas a régua de WhatsApp não envia.

### Editar caso e parcelas

Em **Casos → caso → Editar caso** (`/casos/[id]/editar`) a equipe corrige o cadastro (devedor, referência, detalhe, CPF/CNPJ, telefone, e-mail, valor em aberto) e mexe nas parcelas consolidadas, que é o pedido mais comum do cliente credor: *"essa mensalidade já foi paga"* ou *"não cobre essa"*. Cada parcela pode ser **corrigida** (referência, valor, vencimento), **baixada como paga** (com a data), **retirada da cobrança** (com o motivo, visível ao cliente) ou **reaberta**; também dá para **incluir** uma competência que ficou de fora. A parcela não é apagada: a próxima importação da planilha reconhece referência + vencimento e não a recria. Depois de qualquer mudança o valor em aberto do caso vira a soma das parcelas abertas (`src/lib/domain/parcelas.ts`) e, se não sobrar parcela aberta, o caso encerra sozinho: *pago* se alguma foi paga, *devolvido* se todas foram retiradas. Cobranças já emitidas no Asaas não são canceladas automaticamente; use o botão da cobrança. Requer a migration `0011_parcelas_edicao.sql`.

### Telefones a partir de contatos

Em **Importar → Telefones a partir de contatos**, a equipe envia as exportações de contatos (Digisac: Nome, DDI, Telefone, Atendente, Departamento; ou qualquer CSV com nome e telefone), vários arquivos de uma vez. O sistema cruza com os casos abertos: primeiro por telefone já cadastrado, depois pelo nome (segmentos "EMPRESA - CLIENTE - pessoa", nome contido, duas primeiras palavras). Mostra o que vai preencher, o que já está igual, o que tem telefone diferente (só troca com a caixa marcada), os ambíguos (escolha o caso) e os contatos de cobrança sem caso. Cada gravação vira evento interno no caso. Com a caixa "guardar na agenda" marcada, todos os contatos lidos vão para a tabela **contatos** (migration `0008_contatos.sql`): a aba WhatsApp mostra o nome de quem escreve mesmo sem caso.

### Notificação extrajudicial (aba Notificações)

No caso, a ação **Notificação extrajudicial** gera a minuta com os dados do caso (devedor, documento, credor, parcelas em aberto, valor, prazo) e manda para a fila de revisão do advogado escolhido. Em `/notificacoes/[id]` o advogado edita o texto, preenche nome e OAB, aprova e envia: **WhatsApp com o PDF timbrado em anexo** (modelo `gf_notificacao` na Meta, com cabeçalho de documento; o PDF sai por link com token, por isso defina `APP_URL` na Vercel), ou registra o envio por correio com AR, e-mail ou em mãos. Ao enviar, o caso recebe o evento visível ao cliente e a próxima ação "Fim do prazo da notificação extrajudicial" no prazo escolhido. Requer a migration `0010_notificacoes.sql`.

Modelo a cadastrar na Meta: `gf_notificacao`, categoria Utilidade, pt_BR, **cabeçalho: documento**, corpo: "Olá, {{1}}. Segue em anexo a notificação extrajudicial enviada pelo Gontijo Freitas Advogados em nome de {{2}}, referente a {{3}}. O prazo para regularização ou contato é de {{4}} dias. Para negociar, é só responder aqui."

## Modelo de dados

- **clientes**: credores (escola, contabilidade, empresa, associação) com alçadas, honorários e prazo de protesto.
- **casos**: uma dívida consolidada por cliente + devedor. Fase, responsável, próxima ação (obrigatória quando aberto), exceção (pausa a régua com data de revisão).
- **parcelas**: competências consolidadas no caso (únicas por referência + vencimento). Situação: aberta, paga (`paga_em`) ou retirada da cobrança (`retirada_em`, `retirada_motivo`, migration 0011).
- **eventos**: histórico imutável (trigger bloqueia update/delete), com flag de visibilidade para o cliente.
- **propostas**: termos, dentro/fora da alçada, status.
- **importacoes**: hash único por planilha.
- **ajustes_cliente**: registro imutável de quem alterou alçadas, contato e honorários (cliente ou admin).
- **cobrancas**: boletos/Pix emitidos no Asaas (um por parcela), com status e links.
- **asaas_eventos**: cada evento recebido pelo webhook, uma vez só (idempotência e auditoria).
- **mensagens**: WhatsApp enviado (modelo, texto, status de entrega) e recebido (resposta do devedor).
- **regua**: prazos configuráveis que governam a próxima ação.
- **configuracoes**: chave/valor do sistema. `regua_pausada` é a pausa geral da régua automática (admin liga e pausa pelo Painel).
- **notificacoes**: minuta, revisão, aprovação e envio da notificação extrajudicial, com token do PDF.
- **contatos**: agenda do escritório (telefone canônico, nome, etiquetas). Alimentada pela importação de contatos; usada pela caixa de entrada do WhatsApp.
- **acessos**: log imutável de login (e-mail, resultado, IP, cidade, navegador). Só o admin lê.

## Portal do cliente (etapa 2)

O cliente entra com o próprio usuário e cai em `/portal`. Tudo passa pelo RLS: ele só lê e só grava na própria carteira, e só vê eventos marcados como visíveis.

- **Visão geral**: saldo em cobrança, recuperado no mês, o que depende dele (propostas fora da alçada, casos aguardando orientação), distribuição por etapa, últimas movimentações.
- **Carteira**: todos os casos, com busca e filtro por etapa.
- **Caso**: situação explicada, histórico, parcelas. Ações: *informar pagamento recebido* (caso vai para conferência e a cobrança para), *orientar a equipe* (vira evento e tarefa para o responsável no dia seguinte).
- **Aprovações**: propostas fora da alçada. Aprovar fecha o acordo e cria a tarefa de emitir boletos; recusar devolve o caso à negociação. Decisões ficam registradas com autor.
- **Enviar planilha**: mesma reconciliação da mesa (novo / já em cobrança / baixa / não cobrar / ausentes), travada no cliente logado.
- **Alçadas e contato**: o cliente ajusta a própria alçada; cada alteração entra em `ajustes_cliente` com autor e data, e aparece na aba Clientes da mesa.

Honorários e prazo de protesto são do contrato: só admin altera, pela mesa.

## Painel do admin, relatório mensal e log de acesso (lote 2)

- **Painel** (`/painel`, só admin): recuperado por mês (12 meses) e por cliente, taxa de acordo (acordos ÷ casos com contato humano), tempo médio e mediano da entrada até o pagamento, carteira parada há mais de 60 dias, produtividade por pessoa (contatos, propostas, acordos, registros nos últimos 30 dias, casos e atrasos de hoje).
- **Relatório mensal em PDF** com timbrado: o cliente gera no portal (`/portal/relatorio`, escolhe o mês); a equipe gera de qualquer carteira pelo painel ou em `/api/relatorio?cliente=ID&mes=AAAA-MM`. O PDF é gerado no servidor sem biblioteca externa. A linha do rodapé (endereço, OAB) vem da variável `RELATORIO_RODAPE` na Vercel; sem ela, usa o texto padrão.
- **Log de acesso** (`/painel/acessos`): cada tentativa de login grava e-mail, resultado, IP, cidade aproximada (cabeçalhos da Vercel) e navegador. Requer a migration `0005_acessos.sql`. Falhas de login só são gravadas se `SUPABASE_SERVICE_ROLE_KEY` estiver configurada; o login nunca depende do log.

## Asaas (etapa 3): boleto, Pix e baixa automática

A cobrança é emitida da conta Asaas **do escritório**: o devedor paga ao Asaas, o Asaas avisa o sistema (webhook) e o caso baixa sozinho. O repasse ao cliente continua manual até o split entrar.

### Configurar (uma vez)

1. **Sandbox primeiro.** Crie uma conta em https://sandbox.asaas.com, gere a chave em *Integrações → API* e cadastre na Vercel:
   - `ASAAS_API_KEY` = a chave
   - `ASAAS_ENV` = `sandbox`
   - `ASAAS_WEBHOOK_TOKEN` = uma senha longa que você inventa (ex.: 32 caracteres aleatórios)
2. No Asaas, *Integrações → Webhooks → Novo webhook*:
   - URL: `https://SEU-DOMINIO/api/asaas/webhook`
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: marque os de **cobrança** (PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED e os de chargeback). Os demais são aceitos e ignorados.
   - Versão da API: v3. Fila ativa.
3. Redeploy na Vercel. Abra `/diagnostico`: a seção Asaas tem que estar toda verde. `GET /api/asaas/webhook` responde `configurado: true`.
4. Teste no sandbox: num caso com CPF/CNPJ e valor, *Emitir boleto/Pix no Asaas*. No painel do sandbox, marque a cobrança como recebida. Em segundos o caso vai para "Pago" com o evento "Pagamento confirmado pelo Asaas".
5. Produção: antes de trocar a chave, rode no SQL Editor `update casos set asaas_customer_id = null where asaas_customer_id is not null;` (apaga os ids de devedor criados no sandbox). Depois troque `ASAAS_API_KEY` pela chave da conta real e `ASAAS_ENV` para `production`; cadastre o webhook de novo na conta real. Redeploy.

### O que acontece

| Evento no Asaas | No sistema |
|---|---|
| Cobrança paga (RECEIVED/CONFIRMED) | Marca a cobrança paga. Última em aberto → caso **Pago**, encerrado. Senão, próxima conferência do acordo em 30 dias. |
| Vencida (OVERDUE) | Tarefa para o responsável hoje: "vencida sem pagamento: cobrar o devedor". |
| Cancelada (DELETED) | Registra no histórico (interno). |
| Estornada / chargeback | Caso volta para "Em negociação" com tarefa "verificar e retomar". |

Eventos repetidos são ignorados pelo `id`. Webhook sem token ou com token errado recebe 401. Se o webhook atrasar, "Sincronizar" na cobrança consulta o Asaas na hora.

Nota: os nomes de cabeçalho (`access_token`, `asaas-access-token`) e as URLs base seguem a API v3; se o Asaas mudar algo, `ASAAS_BASE_URL` sobrescreve a URL sem mexer em código.

## WhatsApp oficial (etapa 3): lembretes da régua, link do boleto e respostas do devedor

Usa a **WhatsApp Cloud API da Meta** com um número dedicado à cobrança. Só modelos pré-aprovados saem do sistema; respostas do devedor entram no histórico do caso e viram tarefa para o responsável no mesmo dia. "SAIR" bloqueia mensagens automáticas para aquele devedor.

### Pré-requisitos na Meta (fora do código)

1. **Meta Business Manager** com a empresa verificada (CNPJ e documento).
2. **App no Meta for Developers** do tipo Business com o produto WhatsApp adicionado.
3. **Número dedicado** (chip novo). Um número na Cloud API não pode continuar no app WhatsApp Business.
4. **Usuário do sistema** com token permanente e permissão `whatsapp_business_messaging` e `whatsapp_business_management`.
5. **Modelos aprovados**, categoria *Utilidade*, idioma *Português (BR)*, com os nomes e corpos exatos abaixo. Variáveis `{{n}}` em ordem.

| Nome | Corpo |
|---|---|
| `gf_lembrete_1` | Olá, {{1}}. Aqui é o Gontijo Freitas Advogados, em nome de {{2}}. Consta em aberto {{3}}, referente a {{4}}. Se já pagou, desconsidere esta mensagem. Para regularizar ou negociar, é só responder aqui. Para não receber mais avisos, responda SAIR. |
| `gf_lembrete_2` | Olá, {{1}}. Ainda não localizamos o pagamento de {{2}} ({{3}}) devido a {{4}}. Podemos facilitar com desconto ou parcelamento: responda esta mensagem e um atendente do Gontijo Freitas fala com você. Para não receber avisos, responda SAIR. |
| `gf_boleto` | Olá, {{1}}. Segue a cobrança de {{2}} referente a {{3}} ({{4}}), com vencimento em {{5}}. Pague por boleto ou Pix pelo link: {{6}}. Dúvidas, responda aqui. |
| `gf_vencimento` | Olá, {{1}}. Lembrete: a parcela de {{2}} do seu acordo com {{3}} vence em {{4}}. Pague pelo link: {{5}}. Se já pagou, desconsidere. |
| `gf_acordo_quebrado` | Olá, {{1}}. A parcela de {{2}} do seu acordo com {{3}} venceu em {{4}} e não foi localizada. Regularize pelo link {{5}} ou responda aqui para renegociar antes que o acordo seja cancelado. |

Exemplos para o campo "amostra" da Meta: {{1}} Maria · valor R$ 1.250,50 · referência Mensalidade mar/2026 · credor Colégio WRJ · data 20/10/2026 · link https://www.asaas.com/i/abc123.

### Configurar (uma vez)

1. Vercel: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (inventado), `WHATSAPP_APP_SECRET`, `CRON_SECRET` (inventado), `WHATSAPP_REGUA_AUTOMATICA=false`. Redeploy.
2. Meta for Developers → app → WhatsApp → Configuração → **Webhook**: URL `https://SEU-DOMINIO/api/whatsapp/webhook`, token = `WHATSAPP_VERIFY_TOKEN`. Clique em verificar. Assine o campo **messages**.
3. `/diagnostico`: seção WhatsApp verde. `GET /api/whatsapp/webhook` responde `configurado: true`.
4. **Assinar a conta ao app** (sem isso a Meta não envia status nem respostas, mesmo com o webhook verificado): logado como admin, abra `/api/whatsapp/assinatura`. Se `assinado: false`, faça um `POST` na mesma URL (no console do navegador: `fetch('/api/whatsapp/assinatura', {method: 'POST'}).then(r => r.json()).then(console.log)`). A WABA é descoberta pelo token; se falhar, defina `WHATSAPP_WABA_ID` (WhatsApp Manager → Identificação da conta) e faça redeploy.
5. Teste: num caso com celular, *Enviar WhatsApp* → modelo 1º lembrete → o status muda para Entregue/Lida conforme o webhook chega; responda pelo celular e veja a resposta no caso e a tarefa na Fila.
6. A régua automática tem **duas travas**: a variável `WHATSAPP_REGUA_AUTOMATICA=true` na Vercel e o botão **Ligar a régua** no Painel (admin), guardado no banco (migration `0009_configuracoes.sql`, nasce pausada). Qualquer uma desligada, o cron só simula. Para parar tudo na hora: Painel → **Pausar agora**, sem redeploy.

### Caixa de entrada (aba WhatsApp na mesa)

- `/whatsapp`: todas as conversas por número, quem espera resposta primeiro, contador de não lidas na aba. Filtros: esperando resposta, janela aberta, sem caso.
- Abrir uma conversa marca as recebidas como lidas. Dentro da janela de 24h a operadora responde em texto livre; fora, escolhe um modelo. Tudo cai no histórico do caso como antes.
- Mensagem de número que não combina com nenhum caso fica em "Sem caso"; a operadora vincula ao caso certo (grava o telefone no caso se estiver vazio e move as mensagens).
- A tela relê o banco a cada 20 segundos enquanto está visível. Requer `0006_whatsapp_inbox.sql`.

### O que roda sozinho

- **Cron dias úteis 9h (Brasília)** `GET /api/cron/regua` com `Authorization: Bearer CRON_SECRET` (a Vercel envia). Casos em "Régua automática": 1º lembrete em D+`notif1`, 2º em D+`notif1`+`recontato` (dias da aba Clientes → Régua). Depois a mesa assume. Parcelas de acordo no Asaas: lembrete 3 dias antes do vencimento. Com a régua desligada, o cron só simula: `/api/cron/regua?simular=1` mostra o que enviaria.
- **Emissão no Asaas** com a caixa "Enviar o link por WhatsApp" marcada manda o modelo `gf_boleto` na hora.
- **Webhook**: status de entrega (enviada, entregue, lida, falhou) e respostas. Resposta vira evento visível ao cliente e tarefa "responder hoje". "SAIR" marca opt-out.
- **Responder pelo caso**: nas 24h seguintes a uma resposta do devedor, a operadora responde em texto livre direto do caso (janela de atendimento da Meta). Fora da janela, só modelo.

### Endereço e identidade (Escala Cobrança)

A cobrança tem a identidade visual do Escala (paleta Petróleo & Cobre, Plus Jakarta Sans, logotipo), mas segue como sistema próprio, com banco e login próprios. Endereço: `cobranca.gontijofreitas.adv.br` (projeto `gf-cobranca` na Vercel; DNS na Hostinger com CNAME `cobranca` → `cname.vercel-dns.com`, igual ao `gestao` do Escala). O endereço `gf-cobranca.vercel.app` continua valendo, e é nele que estão os webhooks do Asaas e do WhatsApp e o aquecimento do VPS. Links cruzados: botão "Escala" no topo da mesa e item "Cobrança" no menu lateral do Escala.

### Aquecimento da função (VPS)

As funções da Vercel rodam em São Paulo (`vercel.json`, `regions: ["gru1"]`), mas o plano desliga a função depois de alguns minutos sem uso, e a próxima abertura paga 1 a 2 s a mais. O VPS do escritório (`ssh gfa-worker`) chama `GET /api/ping` a cada 4 minutos em horário comercial pelo arquivo `deploy/aquecer.cron`, instalado em `/etc/cron.d/gf-cobranca-aquecer`. A rota não usa sessão nem banco e é liberada no `proxy.ts`.

### Regras de proteção

- Nunca envia sem celular válido com DDD, com opt-out, com exceção ativa ou fora da fase "Régua automática" (lembretes). Caso em régua sem celular aparece na Fila, em "Completar cadastro", como "Sem celular: a régua automática não envia".
- Cada lembrete sai uma vez por caso; atraso de dias não gera envio duplo.
- Se a Meta não entrega o lembrete duas vezes (número sem WhatsApp, por exemplo), a régua para de tentar nesse caso e ele cai na Fila com "conferir o celular".
- O lembrete de vencimento sai 3 dias antes; como o cron só roda em dia útil, na sexta ele cobre também as parcelas que vencem na terça e na quarta seguintes.
- Webhook exige assinatura `X-Hub-Signature-256` válida (App Secret). Sem ela, 401.
- **Nono dígito**: a Meta entrega o número de quem tem WhatsApp antigo sem o 9 (`556284077891`); o sistema grava e compara tudo na forma com o 9 (`5562984077891`), então a mesma pessoa é uma conversa só. A migration `0007` corrige as mensagens gravadas antes disso.
- Texto enviado fica no histórico do caso, visível ao cliente no portal.
