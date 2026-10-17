import { fmtDataHora } from "@/lib/domain/datas";
import { MENSAGEM_STATUS, type Mensagem } from "@/lib/domain/types";

/** WhatsApp enviado e recebido no caso. Mesa vê tudo; portal vê sem o erro técnico. */
export function MensagensCaso({ mensagens, mesa }: { mensagens: Mensagem[]; mesa: boolean }) {
  if (!mensagens.length) return null;
  return (
    <div className="panel">
      <p className="sec-t">WhatsApp ({mensagens.length})</p>
      <div style={{ display: "grid", gap: 8 }}>
        {mensagens.map((m) => {
          const st = MENSAGEM_STATUS[m.status] ?? { label: m.status, cls: "ph-confirma" };
          return (
            <div key={m.id} style={{ display: "grid", gap: 3, padding: "8px 10px", borderRadius: 4, background: m.direcao === "entrada" ? "var(--warn-bg)" : "var(--ink-05)", marginLeft: m.direcao === "entrada" ? 0 : 24, marginRight: m.direcao === "entrada" ? 24 : 0 }}>
              <div className="meta num" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{m.direcao === "entrada" ? "Devedor" : m.criado_por ?? m.origem} · {fmtDataHora(m.criado_em)}</span>
                <span className={`pill ${st.cls}`}>{st.label}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.texto}</div>
              {mesa && m.erro && <div className="err">{m.erro}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
