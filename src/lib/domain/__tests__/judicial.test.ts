import { describe, expect, it, vi } from "vitest";
import { abrirNoEscala, normaliza, objetoDaAcao, resumoDivida, tarefaDistribuir, tipoContato, tituloProcesso, type ChamarEscala, type DadosEncaminhamento, type RespostaEscala } from "../judicial";

const base: DadosEncaminhamento = {
  caso: { id: "c1", devedor: "Primeira Infância Comunidade Educacional Ltda", documento: "00.279.800/0001-93", documento_digits: "00279800000193", telefone: null, email: null, referencia: "Mensalidades", detalhe: "Ana (5º ano)", valor_atualizado: 2838 },
  cliente: { id: "lobe", nome: "Lobe Consultoria", nome_curto: "Lobe" },
  parcelas: [
    { referencia: "28/05/2025", valor: 1419, vencimento: "2025-06-30", paga: false, retirada_em: null },
    { referencia: "30/08/2025", valor: 1419, vencimento: "2025-08-30", paga: true, retirada_em: null },
  ],
  via: "Execução (título executivo)",
  advogado: "Lucas",
  hoje: "2026-10-31",
  urlCobranca: "https://cobranca.exemplo/casos/c1",
};

const ok = (dados: Record<string, unknown>): RespostaEscala => ({ ok: true, dados });
const erro = (e: string): RespostaEscala => ({ ok: false, erro: e });

/** Escala falso: responde por ferramenta e registra as chamadas. */
function escalaFalso(respostas: Record<string, (args: Record<string, unknown>) => RespostaEscala>) {
  const chamadas: { f: string; args: Record<string, unknown> }[] = [];
  const chamar: ChamarEscala = vi.fn(async (f, args) => {
    chamadas.push({ f, args });
    return (respostas[f] ?? (() => erro(`sem resposta para ${f}`)))(args);
  });
  return { chamar, chamadas };
}

describe("textos do processo", () => {
  it("objeto da ação pela via", () => {
    expect(objetoDaAcao("Execução (título executivo)")).toBe("Execução de título extrajudicial");
    expect(objetoDaAcao("Monitória")).toBe("Ação monitória");
    expect(objetoDaAcao("Juizado Especial")).toBe("Cobrança (Juizado Especial)");
  });
  it("título no padrão CLIENTE x RÉU - Objeto", () => {
    expect(tituloProcesso(base)).toBe("Lobe Consultoria x Primeira Infância Comunidade Educacional Ltda - Execução de título extrajudicial");
  });
  it("resumo lista só as parcelas em aberto e traz o link da cobrança", () => {
    const r = resumoDivida(base);
    expect(r).toContain("Parcelas em aberto (1):");
    expect(r).toContain("28/05/2025");
    expect(r).not.toContain("30/08/2025:");
    expect(r).toContain(base.urlCobranca);
  });
  it("tarefa de distribuir: alta prioridade, 7 dias, alerta de título executivo só na execução", () => {
    const t = tarefaDistribuir(base, "e1");
    expect(t).toMatchObject({ tipo: "tarefa", caso_id: "e1", responsavel: "Lucas", prioridade: "alta", data: "2026-11-07" });
    expect(t.descricao).toContain("2 testemunhas");
    expect(tarefaDistribuir({ ...base, via: "Monitória" }, "e1").descricao).not.toContain("2 testemunhas");
  });
  it("pf/pj pelo tamanho do documento e normalização de nomes", () => {
    expect(tipoContato("12345678901")).toBe("pf");
    expect(tipoContato("00279800000193")).toBe("pj");
    expect(normaliza("Colégio WRJ Ltda.")).toBe("colegio wrj ltda");
  });
});

describe("abrirNoEscala", () => {
  const caminhoFeliz = {
    buscar_contato: (a: Record<string, unknown>) =>
      a.termo === "00279800000193" ? ok({ contatos: [] }) : ok({ contatos: [{ id: "k-lobe", nome: "LOBE CONSULTORIA" }, { id: "k-x", nome: "Lobe Imóveis" }] }),
    criar_caso: () => ok({ id: "e1", url: "https://gestao/casos/e1" }),
    criar_contato: () => ok({ id: "k-dev" }),
    adicionar_envolvido: () => ok({}),
    criar_atividade: () => ok({ id: "t1" }),
  };

  it("caminho feliz: cliente pelo nome exato, devedor criado e vinculado, tarefa criada", async () => {
    const { chamar, chamadas } = escalaFalso(caminhoFeliz);
    const r = await abrirNoEscala(base, chamar);
    expect(r).toEqual({ ok: true, casoId: "e1", url: "https://gestao/casos/e1", contatoClienteId: "k-lobe", avisos: [] });
    const caso = chamadas.find((c) => c.f === "criar_caso")!.args;
    expect(caso).toMatchObject({ cliente: "k-lobe", responsavel: "Lucas", tipo: "processo", polo: "ativo", valor_causa: 2838 });
    expect(chamadas.find((c) => c.f === "criar_contato")!.args).toMatchObject({ nome: base.caso.devedor, tipo: "pj", documento: "00279800000193", cliente: false });
    expect(chamadas.find((c) => c.f === "adicionar_envolvido")!.args).toEqual({ caso_id: "e1", contato_id: "k-dev", qualificacao: "parte_contraria" });
  });

  it("usa o contato do cliente já associado, sem buscar por nome", async () => {
    const { chamar, chamadas } = escalaFalso(caminhoFeliz);
    const r = await abrirNoEscala({ ...base, contatoClienteId: "k-cache" }, chamar);
    expect(r.ok && r.contatoClienteId).toBe("k-cache");
    expect(chamadas.filter((c) => c.f === "buscar_contato").every((c) => c.args.termo === "00279800000193")).toBe(true);
  });

  it("reaproveita o devedor que já existe com o mesmo CNPJ", async () => {
    const { chamar, chamadas } = escalaFalso({ ...caminhoFeliz, buscar_contato: (a) => (a.termo === "00279800000193" ? ok({ contatos: [{ id: "k-dev-antigo", nome: "Primeira Infância", documento: "00.279.800/0001-93" }] }) : caminhoFeliz.buscar_contato(a)) });
    await abrirNoEscala(base, chamar);
    expect(chamadas.some((c) => c.f === "criar_contato")).toBe(false);
    expect(chamadas.find((c) => c.f === "adicionar_envolvido")!.args.contato_id).toBe("k-dev-antigo");
  });

  it("cliente não encontrado: não cria processo e explica", async () => {
    const { chamar, chamadas } = escalaFalso({ ...caminhoFeliz, buscar_contato: () => ok({ contatos: [] }) });
    const r = await abrirNoEscala(base, chamar);
    expect(r).toEqual({ ok: false, erro: 'cliente "Lobe Consultoria" não encontrado nos contatos do Escala' });
    expect(chamadas.some((c) => c.f === "criar_caso")).toBe(false);
  });

  it("cliente ambíguo: não escolhe sozinho", async () => {
    const { chamar } = escalaFalso({ ...caminhoFeliz, buscar_contato: () => ok({ contatos: [{ id: "a", nome: "Lobe Consultoria" }, { id: "b", nome: "Lobe Consultoria" }] }) });
    const r = await abrirNoEscala(base, chamar);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain("mais de um contato");
  });

  it("CNPJ recusado pelo Escala: cadastra o devedor sem documento e segue", async () => {
    const { chamar, chamadas } = escalaFalso({ ...caminhoFeliz, criar_contato: (a) => (a.documento ? erro("CNPJ inválido") : ok({ id: "k-sem-doc" })) });
    const r = await abrirNoEscala(base, chamar);
    expect(r.ok && r.avisos).toEqual([]);
    expect(chamadas.filter((c) => c.f === "criar_contato")).toHaveLength(2);
    expect(chamadas.find((c) => c.f === "adicionar_envolvido")!.args.contato_id).toBe("k-sem-doc");
  });

  it("e-mail recusado pelo Escala: cadastra o devedor sem e-mail e segue", async () => {
    const comEmail = { ...base, caso: { ...base.caso, email: "financeiro@@escola" } };
    const { chamar, chamadas } = escalaFalso({ ...caminhoFeliz, criar_contato: (a) => (a.email ? erro("e-mail inválido") : ok({ id: "k-sem-email" })) });
    const r = await abrirNoEscala(comEmail, chamar);
    expect(r.ok && r.avisos).toEqual([]);
    expect(chamadas.filter((c) => c.f === "criar_contato").at(-1)!.args).not.toHaveProperty("email");
    expect(chamadas.find((c) => c.f === "adicionar_envolvido")!.args.contato_id).toBe("k-sem-email");
  });

  it("falhas depois do processo viram avisos, não erro", async () => {
    const { chamar } = escalaFalso({ ...caminhoFeliz, criar_contato: () => erro("fora do ar"), criar_atividade: () => erro("sem permissão") });
    const r = await abrirNoEscala(base, chamar);
    expect(r.ok).toBe(true);
    expect(r.ok && r.avisos.length).toBe(2);
  });

  it("processo recusado vira erro legível; exceção também", async () => {
    expect(await abrirNoEscala(base, escalaFalso({ ...caminhoFeliz, criar_caso: () => erro("UF inválida") }).chamar)).toEqual({ ok: false, erro: "o Escala recusou o processo: UF inválida" });
    const explode: ChamarEscala = async () => { throw new Error("rede"); };
    expect(await abrirNoEscala(base, explode)).toEqual({ ok: false, erro: "rede" });
  });
});
