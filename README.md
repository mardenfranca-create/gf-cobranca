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
| 3. Integrações | Asaas (boleto, baixa por webhook, split), WhatsApp oficial, exportação do Astrea | |
| 4. Financeiro | Fechamento de êxito, comissão, conciliação | |

## Colocar no ar (primeira vez)

### 1. Banco (Supabase)

1. Projeto Supabase na região **South America (São Paulo)**.
2. No painel: **SQL Editor → New query**, cole o conteúdo de `supabase/migrations/0001_init.sql` e execute. Depois faça o mesmo com `0002_portal.sql` (etapa 2). As migrations são reexecutáveis: rodar de novo não apaga nada.
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
src/app/portal/        portal do cliente: visão geral, carteira, caso, aprovações, planilha, alçadas
src/proxy.ts           renova a sessão e protege rotas
scripts/               carga inicial
```

## Modelo de dados

- **clientes**: credores (escola, contabilidade, empresa, associação) com alçadas, honorários e prazo de protesto.
- **casos**: uma dívida consolidada por cliente + devedor. Fase, responsável, próxima ação (obrigatória quando aberto), exceção (pausa a régua com data de revisão).
- **parcelas**: competências consolidadas no caso (únicas por referência + vencimento).
- **eventos**: histórico imutável (trigger bloqueia update/delete), com flag de visibilidade para o cliente.
- **propostas**: termos, dentro/fora da alçada, status.
- **importacoes**: hash único por planilha.
- **ajustes_cliente**: registro imutável de quem alterou alçadas, contato e honorários (cliente ou admin).
- **regua**: prazos configuráveis que governam a próxima ação.

## Portal do cliente (etapa 2)

O cliente entra com o próprio usuário e cai em `/portal`. Tudo passa pelo RLS: ele só lê e só grava na própria carteira, e só vê eventos marcados como visíveis.

- **Visão geral**: saldo em cobrança, recuperado no mês, o que depende dele (propostas fora da alçada, casos aguardando orientação), distribuição por etapa, últimas movimentações.
- **Carteira**: todos os casos, com busca e filtro por etapa.
- **Caso**: situação explicada, histórico, parcelas. Ações: *informar pagamento recebido* (caso vai para conferência e a cobrança para), *orientar a equipe* (vira evento e tarefa para o responsável no dia seguinte).
- **Aprovações**: propostas fora da alçada. Aprovar fecha o acordo e cria a tarefa de emitir boletos; recusar devolve o caso à negociação. Decisões ficam registradas com autor.
- **Enviar planilha**: mesma reconciliação da mesa (novo / já em cobrança / baixa / não cobrar / ausentes), travada no cliente logado.
- **Alçadas e contato**: o cliente ajusta a própria alçada; cada alteração entra em `ajustes_cliente` com autor e data, e aparece na aba Clientes da mesa.

Honorários e prazo de protesto são do contrato: só admin altera, pela mesa.
