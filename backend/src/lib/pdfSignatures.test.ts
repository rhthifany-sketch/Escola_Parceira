import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { renderPdf } from "../documents/pdf";
import { readPdfSignatures, signedBy } from "./pdfSignatures";

/** Certificado de teste no formato gov.br/ICP ("NOME:CPF"). */
function p12(cn: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0" + Math.floor(Math.random() * 1e9).toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: cn, valueTagClass: forge.asn1.Type.UTF8 }];
  cert.setSubject(attrs as never);
  cert.setIssuer(attrs as never);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "", { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
}

async function sign(pdf: Buffer, cn: string) {
  const withPlaceholder = plainAddPlaceholder({ pdfBuffer: pdf, reason: "teste", contactInfo: "", name: cn, location: "" });
  return new SignPdf().sign(withPlaceholder, new P12Signer(p12(cn)));
}

const basePdf = () => renderPdf({}, (doc) => doc.text("ANEXO I - teste"));

describe("assinaturas do PDF", () => {
  it("PDF sem assinatura", async () => {
    expect(readPdfSignatures(await basePdf())).toEqual([]);
  });

  it("lê nome e CPF do certificado e confere o conteúdo", async () => {
    const signed = await sign(await basePdf(), "CARLA DA SILVA RESPONSÁVEL:99988877766");
    const sigs = readPdfSignatures(signed);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]).toMatchObject({ name: "CARLA DA SILVA RESPONSÁVEL", cpf: "99988877766", integrity: "ok" });
    expect(sigs[0].signedAt).toBeInstanceOf(Date);
    expect(signedBy(sigs[0], { name: "Outra Pessoa", cpf: "999.888.777-66" })).toBe(true);
    expect(signedBy(sigs[0], { name: "Carla da Silva Responsavel", cpf: null })).toBe(true);
    expect(signedBy(sigs[0], { name: "Carla da Silva Responsavel", cpf: "111.111.111-11" })).toBe(false);
  }, 30000);

  it("arquivo editado depois de assinado", async () => {
    const signed = await sign(await basePdf(), "CARLA:99988877766");
    const text = signed.toString("latin1");
    const at = text.indexOf("ANEXO I") >= 0 ? text.indexOf("/Producer") : -1;
    const tampered = Buffer.from(signed);
    tampered[at > 0 ? at + 2 : 20] ^= 1; // muda um byte dentro do conteúdo assinado
    expect(readPdfSignatures(tampered)[0].integrity).toBe("alterado");
  }, 30000);
});
