import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { usePeriod } from "../lib/period";
import { formatDate, type Student } from "../lib/types";
import { UnitPicker } from "../components/Pickers";
import { Alert, Button, Card, Field, Input, Modal, PageTitle, Select, Td, Th } from "../components/ui";

type Form = Omit<Student, "id" | "unitId">;
const empty: Form = {
  name: "", shift: "Integral", grei: "", birthDate: "", phone: "", address: "", email: "",
  enrollmentDate: "", exitDate: "", guardianName: "", guardianCpf: "", guardianPhone: "",
};
const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "");

export function StudentsPage() {
  const { unitId, set } = usePeriod();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showExited, setShowExited] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: students, isLoading } = useQuery({
    queryKey: ["students", unitId],
    enabled: !!unitId,
    queryFn: async () => (await api.get<Student[]>("/students", { params: { unitId } })).data,
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["students", unitId] });
    queryClient.invalidateQueries({ queryKey: ["month"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...editing!.form, unitId };
      return editing!.id ? api.put(`/students/${editing!.id}`, body) : api.post("/students", body);
    },
    onSuccess: () => {
      setEditing(null);
      setMessage({ tone: "success", text: "Cadastro salvo." });
      refresh();
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (s: Student) => api.delete(`/students/${s.id}`),
    onSuccess: () => {
      setMessage({ tone: "success", text: "Criança removida." });
      refresh();
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err) }),
  });

  const importFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("unitId", unitId);
      fd.append("file", file);
      return (await api.post<{ created: number; updated: number; errors: string[] }>("/students/import", fd)).data;
    },
    onSuccess: (r) => {
      setMessage({
        tone: r.errors.length ? "error" : "success",
        text: `${r.created} criança(s) nova(s), ${r.updated} atualizada(s).${r.errors.length ? ` Não importadas: ${r.errors.join("; ")}` : ""}`,
      });
      refresh();
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err) }),
  });

  const term = search.trim().toLowerCase();
  const list = (students ?? []).filter(
    (s) => (showExited || !s.exitDate) && (!term || s.name.toLowerCase().includes(term) || (s.guardianName ?? "").toLowerCase().includes(term))
  );
  const field = (key: keyof Form) => ({
    value: (key.endsWith("Date") ? isoDay(editing!.form[key]) : editing!.form[key]) ?? "",
    onChange: (e: { target: { value: string } }) => setEditing((ed) => ed && { ...ed, form: { ...ed.form, [key]: e.target.value } }),
  });

  return (
    <>
      <PageTitle
        title="Crianças do programa"
        description="Cadastro das crianças e dos responsáveis (quem assina os anexos). Dá para importar a planilha do Anexo X que vocês já usam: quem já existe (mesmo nome) é atualizado, quem é novo entra. Para tirar uma criança do programa, preencha a data de saída — ela continua aparecendo nos meses em que estava matriculada."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile.mutate(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" disabled={!unitId || importFile.isPending} onClick={() => fileRef.current?.click()}>
              <Upload size={16} /> {importFile.isPending ? "Importando…" : "Importar planilha (Anexo X)"}
            </Button>
            <Button disabled={!unitId} onClick={() => setEditing({ id: null, form: { ...empty } })}>
              <Plus size={16} /> Nova criança
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <UnitPicker value={unitId} onChange={(id) => set({ unitId: id })} />
        <Field label="Buscar criança ou responsável">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={showExited} onChange={(e) => setShowExited(e.target.checked)} /> Mostrar quem saiu
        </label>
      </div>
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Criança</Th>
              <Th>GREI / Turno</Th>
              <Th>Matrícula</Th>
              <Th>Responsável</Th>
              <Th>WhatsApp</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <Td className="text-slate-500">Carregando…</Td>
              </tr>
            )}
            {students && list.length === 0 && (
              <tr>
                <Td className="text-slate-500">Nenhuma criança encontrada.</Td>
              </tr>
            )}
            {list.map((s) => (
              <tr key={s.id} className={s.exitDate ? "text-slate-400" : ""}>
                <Td className="font-medium">
                  {s.name}
                  {s.exitDate && <div className="text-xs font-normal">Saiu em {formatDate(s.exitDate)}</div>}
                </Td>
                <Td>
                  {s.grei || "—"} · {s.shift || "—"}
                </Td>
                <Td>{formatDate(s.enrollmentDate)}</Td>
                <Td>
                  {s.guardianName ?? <span className="text-amber-700">não informado</span>}
                  {s.guardianCpf && <div className="text-xs text-slate-500">CPF {s.guardianCpf}</div>}
                </Td>
                <Td>{s.guardianPhone ?? <span className="text-amber-700">—</span>}</Td>
                <Td className="whitespace-nowrap text-right">
                  <button
                    className="mr-3 text-slate-500 hover:text-slate-900"
                    aria-label="Editar"
                    onClick={() => setEditing({ id: s.id, form: { ...empty, ...s } })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="text-slate-400 hover:text-red-700"
                    aria-label="Remover"
                    onClick={() => confirm(`Remover ${s.name} do cadastro?`) && remove.mutate(s)}
                  >
                    <Trash2 size={16} />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <Modal title={editing.id ? "Editar criança" : "Nova criança"} onClose={() => setEditing(null)}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <Field label="Nome da criança">
                <Input {...field("name")} required />
              </Field>
            </div>
            <Field label="GREI (turma)">
              <Input {...field("grei")} required placeholder="ex.: 3" />
            </Field>
            <Field label="Turno">
              <Select {...field("shift")}>
                {["Integral", "Manhã", "Tarde"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data de nascimento">
              <Input type="date" {...field("birthDate")} />
            </Field>
            <Field label="Data de matrícula">
              <Input type="date" {...field("enrollmentDate")} required />
            </Field>
            <Field label="Data de saída" hint="Só se a criança saiu do programa">
              <Input type="date" {...field("exitDate")} />
            </Field>
            <Field label="Telefone (Anexo X)">
              <Input {...field("phone")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Endereço">
                <Input {...field("address")} />
              </Field>
            </div>
            <Field label="E-mail">
              <Input type="email" {...field("email")} />
            </Field>
            <div className="sm:col-span-2 mt-2 border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700">
              Responsável legal (assina os anexos)
            </div>
            <div className="sm:col-span-2">
              <Field label="Nome do responsável">
                <Input {...field("guardianName")} />
              </Field>
            </div>
            <Field label="CPF do responsável">
              <Input {...field("guardianCpf")} placeholder="000.000.000-00" />
            </Field>
            <Field label="WhatsApp do responsável">
              <Input {...field("guardianPhone")} placeholder="(21) 99999-9999" />
            </Field>
            <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
