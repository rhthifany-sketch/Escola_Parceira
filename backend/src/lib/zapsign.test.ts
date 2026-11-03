import { afterEach, describe, expect, it, vi } from "vitest";
import { createDoc, getDoc, requestStatus, zapsignEnabled } from "./zapsign";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZAPSIGN_API_TOKEN;
  delete process.env.ZAPSIGN_API_URL;
});

describe("ZapSign", () => {
  it("sem token fica desligada", async () => {
    expect(zapsignEnabled()).toBe(false);
    await expect(getDoc("x")).rejects.toThrow(/não configurada/);
  });

  it("cria o documento no sandbox com os signatários e sem envio automático", async () => {
    process.env.ZAPSIGN_API_TOKEN = "tok";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: "doc1", status: "pending", signers: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createDoc({
      name: "Anexo I",
      pdf: Buffer.from("%PDF-1.4"),
      externalId: "x",
      signers: [
        { role: "responsável", name: "Carla", phone: "(21) 99999-0000" },
        { role: "escola", name: "Maria", phone: null },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sandbox.api.zapsign.com.br/api/v1/docs/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(init.body));
    expect(body.base64_pdf).toBe(Buffer.from("%PDF-1.4").toString("base64"));
    expect(body.signers[0]).toMatchObject({ name: "Carla", phone_country: "55", phone_number: "21999990000", send_automatic_whatsapp: false, external_id: "responsável" });
    expect(body.signers[1]).not.toHaveProperty("phone_number");
  });

  it("erro de token vira mensagem clara", async () => {
    process.env.ZAPSIGN_API_TOKEN = "tok";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    await expect(getDoc("d")).rejects.toThrow(/recusou o token/);
  });

  it("situação do pedido", () => {
    const s = (status: string) => ({ token: "t", name: "n", sign_url: "u", status });
    expect(requestStatus({ token: "d", status: "pending", signers: [s("signed"), s("new")] })).toBe("PENDENTE");
    expect(requestStatus({ token: "d", status: "pending", signers: [s("signed"), s("signed")] })).toBe("ASSINADO");
    expect(requestStatus({ token: "d", status: "signed", signers: [] })).toBe("ASSINADO");
    expect(requestStatus({ token: "d", status: "refused", signers: [s("new")] })).toBe("RECUSADO");
  });
});
