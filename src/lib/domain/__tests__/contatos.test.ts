import { describe, expect, it } from "vitest";
import { cruzaContatos, leContatos, normalizaNome, parseCsv, resumoCruzamento, telefoneE164, type CasoTel } from "../contatos";

const CSV = `Nome,DDI,Telefone,Atendente Padrão,Departamento Padrão,Tags,Criado em
UNIPECAS - KR COMPONENTES - LOBE,55,6493165565,Ana Paula,Financeiro e Cobranças,,07/10/2026
"Silva, Maria",55,62999990001,,,,07/10/2026
Marden,55,6284077891,,,#empresarial,10/04/2025
17015557208,1,7015557208,,,,28/06/2026
MUNDIAL SUPERMERCADOS LTDA - LOBE -,55,6292416869,Ana Paula,Financeiro e Cobranças,,26/01/2026
Sem telefone,55,,,,,01/01/2026
`;
const casos: CasoTel[] = [
  { id: "a", cliente_id: "lobe", devedor: "KR Componentes Ltda", telefone: null, fase: "neg" },
  { id: "b", cliente_id: "lobe", devedor: "Mundial Supermercados", telefone: "(62) 99241-6869", fase: "regua" },
  { id: "c", cliente_id: "wrj", devedor: "Maria Silva", telefone: null, fase: "regua" },
  { id: "d", cliente_id: "wrj", devedor: "Maria Silva", telefone: "62988887777", fase: "neg" },
];
const clientes = [{ id: "lobe", nome: "Lobe Contabilidade", nome_curto: "Lobe" }, { id: "wrj", nome: "Colégio WRJ", nome_curto: "WRJ" }];

describe("contatos", () => {
  it("lê CSV com aspas e telefone com DDI", () => {
    expect(parseCsv('a,"b, c",d\n1,2,3')).toEqual([["a", "b, c", "d"], ["1", "2", "3"]]);
    expect(telefoneE164("55", "6493165565")).toBe("5564993165565"); // fixo-like 10 dígitos com 9 → acrescenta 9
    expect(telefoneE164("55", "62999990001")).toBe("5562999990001");
    expect(telefoneE164("1", "7015557208")).toBe("17015557208");
    expect(telefoneE164("55", "")).toBeNull();
    const { contatos } = leContatos(CSV, "p1.csv");
    expect(contatos.map((c) => c.nome)).toEqual(["UNIPECAS - KR COMPONENTES - LOBE", "Silva, Maria", "Marden", "17015557208", "MUNDIAL SUPERMERCADOS LTDA - LOBE -"]);
    expect(contatos[0].departamento).toBe("Financeiro e Cobranças");
  });
  it("normaliza nomes", () => {
    expect(normalizaNome("Mundial Supermercados Ltda.")).toBe("MUNDIAL SUPERMERCADOS");
    expect(normalizaNome("João da Silva")).toBe("JOAO SILVA");
  });
  it("cruza por telefone, por segmento do nome e marca ambíguos", () => {
    const { contatos } = leContatos(CSV, "p1.csv");
    const r = cruzaContatos(contatos, casos, clientes);
    const por = (nome: string) => r.find((x) => x.contato.nome === nome)!;
    expect(por("UNIPECAS - KR COMPONENTES - LOBE")).toMatchObject({ kind: "preencher", cliente_id: "lobe", forca: "exata", cobranca: true });
    expect(por("UNIPECAS - KR COMPONENTES - LOBE").caso?.id).toBe("a");
    expect(por("MUNDIAL SUPERMERCADOS LTDA - LOBE -")).toMatchObject({ kind: "igual", cobranca: true });
    expect(por("Silva, Maria")).toMatchObject({ kind: "ambiguo", cobranca: false });
    expect(por("Silva, Maria").candidatos.map((c) => c.id)).toEqual(["c", "d"]);
    expect(por("Marden").kind).toBe("sem_caso");
    expect(resumoCruzamento(r)).toMatchObject({ total: 5, preencher: 1, igual: 1, ambiguo: 1, sem_caso: 2, cobrancaSemCaso: 0 });
  });
});
