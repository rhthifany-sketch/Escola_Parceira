import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { MONTHS, type SendSummary } from "../lib/types";
import { Alert, Button, Card, Field, Input, PageTitle, Select, Td, Th } from "../components/ui";

interface SettingsView {
  settings: { autoSendEnabled: boolean; autoSendDay: number; autoSendMonth: "ATUAL" | "ANTERIOR"; autoSendWhatsapp: boolean };
  zapsign: { sandbox: boolean } | null;
  next: { date: { year: number; month: number; day: number }; reference: { year: number; month: number }; late: boolean } | null;
  runs: { id: string; year: number; month: number; runAt: string; summary: SendSummary & { andamento?: boolean } }[];
}

const monthName = (m: number, y: number) => `${MONTHS[m - 1].toLowerCase()}/${y}`;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get<SettingsView>("/settings")).data });
  const [form, setForm] = useState<SettingsView["settings"] | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.put<SettingsView>("/settings", form)).data,
    onSuccess: (v) => {
      queryClient.setQueryData(["settings"], v);
      setMessage({ tone: "success", text: "Configurações salvas." });
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err) }),
  });
  const reopen = useMutation({
    mutationFn: async (id: string) => (await api.delete<SettingsView>(`/settings/runs/${id}`)).data,
    onSuccess: (v) => queryClient.setQueryData(["settings"], v),
  });

  // webhook: endereço da API + /webhooks/zapsign
  const webhookUrl = `${String(api.defaults.baseURL ?? "").replace(/\/+$/, "")}/webhooks/zapsign`;

  if (!data || !form) return <p className="text-sm text-slate-500">Carregando…</p>;
  const set = (patch: Partial<SettingsView["settings"]>) => setForm({ ...form, ...patch });
  return (
    <>
      <PageTitle title="Configurações" description="Envio automático dos pedidos de assinatura pela ZapSign." />
      <div className="flex max-w-3xl flex-col gap-4">
        {!data.zapsign && (
          <Alert tone="warning">A ZapSign não está configurada no servidor (falta ZAPSIGN_API_TOKEN no Render). O envio automático só funciona com ela.</Alert>
        )}
        {data.zapsign?.sandbox && (
          <Alert tone="warning">A ZapSign está no ambiente de TESTE: os documentos enviados não têm validade jurídica.</Alert>
        )}
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold">Envio automático do mês</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoSendEnabled} onChange={(e) => set({ autoSendEnabled: e.target.checked })} />
            <span>
              <strong>Ligado</strong> — no dia escolhido, o sistema cria um link por criança (todos os documentos pendentes dela juntos), em
              todas as unidades ativas.
            </span>
          </label>
          <div className="flex flex-wrap gap-4">
            <Field label="Dia do mês" hint="De 1 a 28">
              <Input
                type="number"
                min={1}
                max={28}
                className="w-24"
                value={form.autoSendDay}
                onChange={(e) => set({ autoSendDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </Field>
            <Field label="Documentos de qual mês">
              <Select value={form.autoSendMonth} onChange={(e) => set({ autoSendMonth: e.target.value as "ATUAL" | "ANTERIOR" })}>
                <option value="ATUAL">Do próprio mês (ex.: dia {form.autoSendDay}/10 → outubro)</option>
                <option value="ANTERIOR">Do mês anterior (ex.: dia {form.autoSendDay}/11 → outubro)</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoSendWhatsapp} onChange={(e) => set({ autoSendWhatsapp: e.target.checked })} />
            A ZapSign manda o convite no WhatsApp de cada responsável (criança sem WhatsApp cadastrado fica de fora e aparece no resumo)
          </label>
          <p className="text-xs text-slate-500">
            O Anexo I declara a frequência do mês inteiro e sai datado do último dia do mês. Enviando no meio do mês, o responsável
            assina antes do mês acabar.
          </p>
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={14} /> {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          {data.settings.autoSendEnabled && data.next && (
            <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {data.next.late
                ? `O dia ${data.settings.autoSendDay} deste mês já passou: o envio de ${monthName(data.next.reference.month, data.next.reference.year)} acontece em até 30 minutos.`
                : `Próximo envio: ${String(data.next.date.day).padStart(2, "0")}/${String(data.next.date.month).padStart(2, "0")}/${data.next.date.year}, com os documentos de ${monthName(data.next.reference.month, data.next.reference.year)}.`}
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Aviso da ZapSign quando alguém assina (opcional)</h2>
          <p className="text-slate-600">
            O sistema confere as assinaturas sozinho a cada 3 horas. Para a tela atualizar na hora em que o responsável assina, na ZapSign
            vá em <strong>Configurações → Integração → Webhooks</strong>, ligue e cadastre este endereço:
          </p>
          <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs">{webhookUrl}</code>
        </Card>

        <Card className="overflow-x-auto p-0">
          <div className="px-4 pt-4 font-semibold">Envios automáticos feitos</div>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                <Th>Mês dos documentos</Th>
                <Th>Enviado em</Th>
                <Th>Resultado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.runs.length === 0 && (
                <tr>
                  <Td className="text-slate-500">Nenhum envio automático ainda.</Td>
                </tr>
              )}
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <Td>{monthName(r.month, r.year)}</Td>
                  <Td>{new Date(r.runAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</Td>
                  <Td>
                    {r.summary.andamento ? (
                      "em andamento…"
                    ) : (
                      <>
                        {r.summary.sent} enviado(s)
                        {r.summary.skipped?.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-amber-700">{r.summary.skipped.length} de fora</summary>
                            <ul className="text-xs text-slate-600">
                              {r.summary.skipped.map((s, i) => (
                                <li key={i}>{s.unit} — {s.student}: {s.reason}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {r.summary.errors?.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-red-700">{r.summary.errors.length} erro(s)</summary>
                            <ul className="text-xs text-slate-600">
                              {r.summary.errors.map((e, i) => (
                                <li key={i}>{e.unit} — {e.student}: {e.error}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button
                      className="text-xs text-slate-500 hover:underline"
                      onClick={() =>
                        confirm("Liberar este mês para ser enviado de novo na próxima verificação? Só quem ainda não tem link aberto recebe.") &&
                        reopen.mutate(r.id)
                      }
                    >
                      enviar de novo
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
