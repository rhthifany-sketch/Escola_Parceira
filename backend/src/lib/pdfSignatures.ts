import crypto from "crypto";
import forge from "node-forge";

/**
 * Lê as assinaturas digitais de um PDF (gov.br / ICP-Brasil): quem assinou
 * (nome e CPF do certificado), quando, e se o conteúdo assinado continua
 * igual (o resumo do arquivo bate com o que foi assinado).
 *
 * Não valida a cadeia do certificado até a raiz do gov.br — para a
 * validação oficial existe o validar.iti.gov.br. Aqui o objetivo é saber
 * QUEM assinou cada documento e pegar arquivo trocado/editado.
 */
export interface PdfSignature {
  name: string;
  cpf: string | null;
  signedAt: Date | null;
  /** ok = o conteúdo assinado não mudou; alterado = mudou; desconhecido = não deu pra conferir. */
  integrity: "ok" | "alterado" | "desconhecido";
}

const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";
const DIGESTS: Record<string, string> = {
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
};

export function readPdfSignatures(pdf: Buffer): PdfSignature[] {
  const text = pdf.toString("latin1");
  const result: PdfSignature[] = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [a, b, c, d] = m.slice(1, 5).map(Number);
    const key = `${a}-${b}-${c}-${d}`;
    if (seen.has(key) || a !== 0 || c <= b || c + d > pdf.length) continue;
    seen.add(key);
    try {
      const hex = text.slice(b, c).replace(/[<>\s]/g, "").replace(/(00)+$/, "");
      if (!hex) continue;
      const der = forge.util.hexToBytes(hex.length % 2 ? hex + "0" : hex);
      const asn1 = forge.asn1.fromDer(der, { parseAllBytes: false, strict: false } as never);
      result.push(parseCms(asn1, Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)])));
    } catch {
      result.push({ name: "Assinatura ilegível", cpf: null, signedAt: null, integrity: "desconhecido" });
    }
  }
  return result;
}

function parseCms(asn1: forge.asn1.Asn1, signedBytes: Buffer): PdfSignature {
  const p7 = forge.pkcs7.messageFromAsn1(asn1) as forge.pkcs7.PkcsSignedData & { rawCapture?: { signerInfos?: forge.asn1.Asn1[] } };
  const signerInfo = p7.rawCapture?.signerInfos?.[0];
  const certs = p7.certificates ?? [];

  // certificado de quem assinou: o que bate com o número de série do signerInfo
  let cert = certs[0];
  const serial = signerInfo ? serialOf(signerInfo) : null;
  if (serial) cert = certs.find((c) => c.serialNumber.replace(/^0+/, "") === serial.replace(/^0+/, "")) ?? cert;

  const cn = String(cert?.subject.getField("CN")?.value ?? "");
  const decoded = decodeUtf8(cn);
  const [namePart, cpfPart] = decoded.split(":");
  let cpf = cpfPart && /^\d{11}$/.test(cpfPart.trim()) ? cpfPart.trim() : null;
  if (!cpf && cert) cpf = cpfFromAltName(cert);

  let integrity: PdfSignature["integrity"] = "desconhecido";
  let signedAt: Date | null = null;
  if (signerInfo) {
    const { digestOid, attrs } = signerInfoParts(signerInfo);
    const algo = digestOid ? DIGESTS[digestOid] : undefined;
    const expected = attrs.get(OID_MESSAGE_DIGEST);
    if (algo && expected) {
      const actual = crypto.createHash(algo).update(signedBytes).digest("binary");
      integrity = actual === expected ? "ok" : "alterado";
    }
    const time = attrs.get(OID_SIGNING_TIME);
    if (time) signedAt = parseAsn1Time(time);
  }
  return { name: (namePart || decoded || "Sem nome").trim(), cpf, signedAt, integrity };
}

const decodeUtf8 = (s: string) => {
  try {
    return forge.util.decodeUtf8(s);
  } catch {
    return s;
  }
};

function serialOf(signerInfo: forge.asn1.Asn1): string | null {
  const parts = signerInfo.value as forge.asn1.Asn1[];
  const issuerAndSerial = parts[1];
  const serial = (issuerAndSerial?.value as forge.asn1.Asn1[] | undefined)?.[1];
  return serial && typeof serial.value === "string" ? forge.util.bytesToHex(serial.value) : null;
}

function signerInfoParts(signerInfo: forge.asn1.Asn1) {
  const parts = signerInfo.value as forge.asn1.Asn1[];
  const digestAlg = parts[2]?.value as forge.asn1.Asn1[] | undefined;
  const digestOid = digestAlg?.[0] ? forge.asn1.derToOid(digestAlg[0].value as string) : null;
  const attrs = new Map<string, string>();
  const signed = parts.find((p) => p.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && p.type === 0);
  for (const attr of (signed?.value as forge.asn1.Asn1[] | undefined) ?? []) {
    const [oid, set] = attr.value as forge.asn1.Asn1[];
    const first = (set?.value as forge.asn1.Asn1[] | undefined)?.[0];
    if (oid && first) attrs.set(forge.asn1.derToOid(oid.value as string), typeof first.value === "string" ? first.value : "");
  }
  return { digestOid, attrs };
}

function parseAsn1Time(v: string): Date | null {
  try {
    return v.length > 13 ? forge.asn1.generalizedTimeToDate(v) : forge.asn1.utcTimeToDate(v);
  } catch {
    return null;
  }
}

/** ICP-Brasil: OID 2.16.76.1.3.1 = data de nascimento (8) + CPF (11) + … */
function cpfFromAltName(cert: forge.pki.Certificate): string | null {
  const ext = cert.extensions.find((e) => e.name === "subjectAltName") as { value?: string } | undefined;
  if (!ext?.value) return null;
  const raw = ext.value;
  const marker = forge.asn1.oidToDer("2.16.76.1.3.1").getBytes();
  const at = raw.indexOf(marker);
  if (at < 0) return null;
  const digits = raw.slice(at + marker.length).replace(/[^0-9]/g, "");
  return digits.length >= 19 ? digits.slice(8, 19) : null;
}

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const normName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

/** A assinatura é dessa pessoa? Pelo CPF; sem CPF no certificado, pelo nome completo. */
export function signedBy(sig: PdfSignature, person: { name: string | null; cpf: string | null }): boolean {
  const cpf = onlyDigits(person.cpf);
  if (sig.cpf && cpf.length === 11) return sig.cpf === cpf;
  return !!person.name && normName(sig.name) === normName(person.name);
}
