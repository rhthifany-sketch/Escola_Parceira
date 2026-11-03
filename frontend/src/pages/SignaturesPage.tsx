import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, MessageCircle, Upload } from "lucide-react";
import { api, download, errorMessage } from "../lib/api";
import { usePeriod } from "../lib/period";
import { MONTHS, type DocType, type SignatureItem, type SignatureRow } from "../lib/types";
import { MonthPicker, UnitPicker } from "../components/Pickers";
import { Alert, Button, Card, Modal, PageTitle, Td, Th } from "../components/ui";

const COLUMNS: { type: DocType; label: string; number: number }[] = [
  { type: "ANEXO_I", label: "Anexo I", number: 1 },
  { type: "ANEXO_II", label: "Anexo II", number: 2 },
  { type: "ANEXO_III", label: "Anexo III", number: 3 },
  { type: "ANEXO_IV", label: "Anexo IV", number: 4 },
  { type: "ANEXO_V", label: "Anexo V", number: 5 },
];

const maskCpf = (cpf: string | null) => (cpf ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : "sem CPF no certificado");
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

function chip(item: SignatureItem) {
  if (item.complete) return { text: "Assinado", cls: "bg-green-50 text-green-700 border-green-200" };
  if (item.altered) return { text: "Arquivo alterado", cls: "bg-red-50 text-red-700 border-red-200" };
  if (item.doc) return { text: `Falta ${item.missing.join(" e ")}`, cls: "bg-amber-50 text-amber-800 border-amber-200" };
  return { text: "Pendente", cls: "bg-slate-50 text-slate-600 border-slate-200" };
}

export function SignaturesPage() {
  const { year, month, unitId, set } = usePeriod();
  const queryClient = useQueryClient();
  const params = { unitId, year, month };
  const [open, setOpen] = useState<{ row: SignatureRow; item: SignatureItem } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "warning"; text: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["signatures", unitId, year, month],
    enabled: !!unitId,
    queryFn: async () => (await api.get<{ rows: SignatureRow[]; maxMb: number }>("/signatures", { params })).data,
  });
  const rows = data?.rows ?? [];
  const done = rows.filter((r) => r.complete).length;

  const getMerged = async (c: (typeof COLUMNS)[number]) => {
    setMessage(null);
    try {
      const h = await download(`/signatures/merged/${c.type}`, params);
      const missing = Number(h["x-faltando"] ?? 0);
      const failed = h["x-nao-abriram"] ? decodeURIComponent(h["x-nao-abriram"]) : "";
      if (missing || failed) {
        setMessage({
          tone: "warning",
          text: `ANEXO ${c.number} baixado, mas ${missing ? `${missing} criança(s) ainda sem o ${c.label} assinado` : ""}${missing && failed ? " e " : ""}${failed ? `não deu para abrir o PDF de: ${failed}` : ""}.`,
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <>
      <PageTitle
        title="Assinaturas"
        description="Os anexos assinados de cada criança. Envie o PDF assinado — escaneado do papel ou assinado digitalmente (gov.br). No PDF digital, o sistema confere sozinho se o responsável e o representante da escola assinaram. Os Anexos II, III, IV e V são assinados uma vez e ficam valendo para os meses seguintes; o Anexo I é todo mês."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <UnitPicker value={unitId} onChange={(id) => set({ unitId: id })} />
        <MonthPicker year={year} month={month} onChange={set} />
      </div>
      {isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
      {data && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-wrap items-center gap-4">
            <div className="text-sm">
              <span className="text-2xl font-semibold text-slate-900">{done}</span>
              <span className="text-slate-500"> de {rows.length} criança(s) com tudo assinado em {MONTHS[month - 1].toLowerCase()}/{year}</span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-slate-500">Assinados, juntos para a prefeitura:</span>
              {COLUMNS.map((c) => (
                <Button key={c.type} variant="secondary" onClick={() => getMerged(c)}>
                  <Download size={14} /> {c.label}
                </Button>
              ))}
            </div>
          </Card>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Criança / responsável</Th>
                  {COLUMNS.map((c) => (
                    <Th key={c.type} className="text-center">{c.label}</Th>
                  ))}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <Td className="text-slate-500">Nenhuma criança matriculada nesse mês.</Td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.studentId} className={r.complete ? "bg-green-50/40" : ""}>
                    <Td>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        {r.guardianName ?? <Link className="text-amber-700 underline" to={`/criancas?unidade=${unitId}`}>responsável não informado</Link>}
                      </div>
                    </Td>
                    {COLUMNS.map((c) => {
                      const item = r.items.find((i) => i.type === c.type);
                      if (!item) return <Td key={c.type} className="text-center text-xs text-slate-400">não se aplica</Td>;
                      const { text, cls } = chip(item);
                      return (
                        <Td key={c.type} className="text-center">
                          <button onClick={() => setOpen({ row: r, item })} className={`rounded-full border px-2.5 py-1 text-xs font-medium hover:brightness-95 ${cls}`}>
                            {text}
                          </button>
                        </Td>
                      );
                    })}
                    <Td className="text-right">
                      {r.whatsapp && (
                        <a href={r.whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-green-300 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-50">
                          <MessageCircle size={14} /> Avisar no WhatsApp
                        </a>
                      )}
                      {!r.whatsapp && !r.complete && !r.guardianPhone && (
                        <span className="text-xs text-slate-400">sem WhatsApp</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
      {open && (
        <DocModal
          row={open.row}
          item={open.item}
          params={params}
          maxMb={data?.maxMb ?? 10}
          onClose={() => setOpen(null)}
          onChanged={(item) => {
            queryClient.invalidateQueries({ queryKey: ["signatures", unitId, year, month] });
            queryClient.invalidateQueries({ queryKey: ["overview"] });
            if (item) setOpen((o) => o && { ...o, item });
            else setOpen(null);
          }}
        />
      )}
    </>
  );
}

function DocModal({
  row,
  item,
  params,
  maxMb,
  onClose,
  onChanged,
}: {
  row: SignatureRow;
  item: SignatureItem;
  params: { unitId: string; year: number; month: number };
  maxMb: number;
  onClose: () => void;
  onChanged: (item: SignatureItem | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const col = COLUMNS.find((c) => c.type === item.type)!;
  const who = [item.needsGuardian && "o responsável", item.needsSchool && "o representante legal da escola"].filter(Boolean).join(" e ");

  const send = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > maxMb * 1024 * 1024) throw new Error(`O arquivo passa de ${maxMb} MB. Digitalize com qualidade menor.`);
      const fd = new FormData();
      fd.append("studentId", row.studentId);
      fd.append("type", item.type);
      fd.append("year", String(params.year));
      fd.append("month", String(params.month));
      fd.append("file", file);
      await api.post("/signatures/upload", fd);
      const fresh = (await api.get<{ rows: SignatureRow[] }>("/signatures", { params })).data.rows;
      return fresh.find((r) => r.studentId === row.studentId)?.items.find((i) => i.type === item.type) ?? null;
    },
    onSuccess: (fresh) => {
      setError("");
      onChanged(fresh);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/signatures/${item.doc!.id}`),
    onSuccess: () => onChanged(null),
    onError: (err) => setError(errorMessage(err)),
  });
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const { text, cls } = chip(item);

  return (
    <Modal title={`${item.label} — ${row.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>{text}</span>
          <span className="text-slate-500">
            Quem assina: {who}.{item.type === "ANEXO_I" ? " Todo mês." : " Uma vez (vale para os próximos meses)."}
          </span>
        </div>

        {item.doc && (
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 font-medium">Arquivo enviado</div>
            <div className="text-slate-600">
              {item.doc.fileName} · {item.doc.method === "PAPEL" ? "assinado no papel (digitalizado)" : "assinado digitalmente"} · enviado em {dateTime(item.doc.uploadedAt)}
              {item.doc.uploadedBy && ` por ${item.doc.uploadedBy}`}
            </div>
            {item.doc.method === "DIGITAL" && (
              <ul className="mt-2 flex flex-col gap-1">
                {item.doc.signatures.map((s, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-slate-500">CPF {maskCpf(s.cpf)}</span>
                    {s.signedAt && <span className="text-slate-500">· {dateTime(s.signedAt)}</span>}
                    {s.integrity === "alterado" && <span className="font-medium text-red-700">· arquivo alterado depois desta assinatura</span>}
                  </li>
                ))}
              </ul>
            )}
            {item.missing.length > 0 && (
              <p className="mt-2 text-amber-800">
                Não encontrei a assinatura d{item.missing.length > 1 ? "e " : "o(a) "}{item.missing.join(" e ")} neste PDF. Confira se o CPF cadastrado
                (responsável na criança / representante na unidade) é o mesmo de quem assinou.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => run(() => download(`/signatures/${item.doc!.id}/file`))}>
                <Download size={14} /> Ver arquivo
              </Button>
              <Button variant="danger" disabled={remove.isPending} onClick={() => confirm("Excluir o arquivo enviado?") && remove.mutate()}>
                Excluir arquivo
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-md bg-slate-50 p-3">
          <div className="mb-2 font-medium">{item.doc ? "Trocar o arquivo" : "Como enviar"}</div>
          <ol className="mb-3 list-decimal pl-5 text-slate-600">
            <li>Baixe o anexo desta criança e colha as assinaturas (no papel ou no gov.br).</li>
            <li>Envie o PDF assinado aqui. Papel: digitalize em PDF (não vale foto/imagem).</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => run(() => download(`/months/anexo-${col.number}.pdf`, { ...params, studentId: row.studentId }))}
            >
              <Download size={14} /> Baixar para assinar
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) send.mutate(f);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={send.isPending}>
              <Upload size={14} /> {send.isPending ? "Enviando…" : "Enviar PDF assinado"}
            </Button>
          </div>
        </div>
        <Alert>{error}</Alert>
      </div>
    </Modal>
  );
}
