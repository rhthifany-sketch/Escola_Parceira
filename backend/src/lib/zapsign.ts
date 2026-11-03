import { HttpError } from "./http";

/**
 * Cliente da API da ZapSign (https://docs.zapsign.com.br).
 * ZAPSIGN_API_TOKEN: token da conta (Configurações → Integração → API).
 * ZAPSIGN_API_URL: padrão é o ambiente de testes (sandbox, sem validade
 * jurídica); em produção, https://api.zapsign.com.br/api/v1.
 *
 * Convite: por padrão o sistema recebe o link de cada signatário e manda
 * pelo botão de WhatsApp dele; no envio automático (ou se pedido) a própria
 * ZapSign manda o convite pelo WhatsApp do responsável.
 */
export const SANDBOX_URL = "https://sandbox.api.zapsign.com.br/api/v1";

export const zapsignConfig = () => ({
  token: process.env.ZAPSIGN_API_TOKEN?.trim() || null,
  url: (process.env.ZAPSIGN_API_URL?.trim() || SANDBOX_URL).replace(/\/+$/, ""),
});
export const zapsignEnabled = () => !!zapsignConfig().token;
export const zapsignIsSandbox = () => zapsignConfig().url.includes("sandbox");

export interface ZapSigner {
  token: string;
  name: string;
  sign_url: string;
  status: string; // "new" | "link-opened" | "signed" | …
  signed_at?: string | null;
  external_id?: string | null;
}

export interface ZapDoc {
  token: string;
  status: string; // "pending" | "signed" | "refused"
  signed_file?: string | null;
  signers: ZapSigner[];
}

/** Mostra só o começo e o fim do token, pra conferir sem expor. */
const maskToken = (t: string) => (t.length > 10 ? `${t.slice(0, 4)}…${t.slice(-4)} (${t.length} caracteres)` : `(${t.length} caracteres)`);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { token, url } = zapsignConfig();
  if (!token) throw new HttpError(400, "ZapSign não configurada (falta ZAPSIGN_API_TOKEN no servidor)");
  let res: Response;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new HttpError(502, "Não foi possível falar com a ZapSign agora. Tente de novo em alguns minutos.");
  }
  const text = await res.text();
  if (!res.ok) {
    const detail = text.slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      const env = url.includes("sandbox") ? "de TESTES (sandbox)" : "de PRODUÇÃO";
      const other = url.includes("sandbox") ? "da conta normal (app.zapsign.com.br)" : "da conta de testes (sandbox)";
      throw new HttpError(
        502,
        `A ZapSign recusou o token. O sistema está usando o ambiente ${env} (${url}), e o token cadastrado em ` +
          `ZAPSIGN_API_TOKEN não existe nesse ambiente — talvez seja ${other}. Token usado: ${maskToken(token)}. ${detail}`
      );
    }
    throw new HttpError(502, `A ZapSign respondeu com erro ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface NewSigner {
  role: "responsável" | "escola";
  name: string;
  phone: string | null;
  /** a ZapSign manda o convite pelo WhatsApp (tem custo no plano dela) */
  sendWhatsapp?: boolean;
}

/** Cria o documento na ZapSign a partir do PDF e devolve os links de cada signatário. */
export function createDoc(opts: { name: string; pdf: Buffer; externalId: string; signers: NewSigner[] }) {
  return call<ZapDoc>("POST", "/docs/", {
    name: opts.name,
    base64_pdf: opts.pdf.toString("base64"),
    external_id: opts.externalId,
    lang: "pt-br",
    disable_signer_emails: true,
    signers: opts.signers.map((s) => {
      const digits = (s.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
      return {
        name: s.name,
        external_id: s.role,
        auth_mode: "assinaturaTela",
        send_automatic_email: false,
        send_automatic_whatsapp: !!s.sendWhatsapp && digits.length >= 10,
        ...(digits.length >= 10 ? { phone_country: "55", phone_number: digits } : {}),
      };
    }),
  });
}

export const getDoc = (token: string) => call<ZapDoc>("GET", `/docs/${encodeURIComponent(token)}/`);

/** Baixa o PDF assinado (link temporário que a ZapSign devolve). */
export async function downloadSignedFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(502, `Não consegui baixar o PDF assinado da ZapSign (erro ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Situação do pedido a partir do documento da ZapSign. */
export function requestStatus(doc: ZapDoc): "PENDENTE" | "ASSINADO" | "RECUSADO" {
  if (doc.status === "signed" || (doc.signers.length > 0 && doc.signers.every((s) => s.status === "signed"))) return "ASSINADO";
  if (doc.status === "refused") return "RECUSADO";
  return "PENDENTE";
}
