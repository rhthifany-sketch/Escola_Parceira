import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { usePeriod } from "../lib/period";
import { formatDate, type Student } from "../lib/types";
import { UnitPicker } from "../components/Pickers";
import { Alert, Button, Card, ConfirmDelete, Field, Input, Modal, PageTitle, RowActions, Select, Td, Th } from "../components/ui";

type Form = Omit<Student, "id" | "unitId">;
const empty: Form = {
  name: "", shift: "Integral", grei: "", birthDate: "", phone: "", address: "", email: "",
  enrollmentDate: "", exitDate: "", guardianName: "", guardianCpf: "", guardianPhone: "", materialDeliveredAt: "",
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Student[] | null>(null);
  const [deleteError, setDeleteError] = useState("");

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
    mutationFn: (list: Student[]) =>
      list.length === 1 ? api.delete(`/students/${list[0].id}`) : api.post("/students/delete-many", { ids: list.map((s) => s.id) }),
    onSuccess: (_r, list) => {
      setDeleting(null);
      setSelected(new Set());
      setMessage({ tone: "success", text: list.length === 1 ? `${list[0].name} foi excluída.` : `${list.length} crianças excluídas.` });
      refresh();
    },
    onError: (err) => setDeleteError(errorMessage(err)),
  });
  const askDelete = (list: Student[]) => {
    setDeleteError("");
    setDeleting(list);
  };

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
  const allSelected = list.length > 0 && list.every((s) => selected.has(s.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedStudents = (students ?? []).filter((s) => selected.has(s.id));
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
        {selectedStudents.length > 0 && (
          <Button variant="danger" className="ml-auto" onClick={() => askDelete(selectedStudents)}>
            <Trash2 size={16} /> Excluir selecionadas ({selectedStudents.length})
          </Button>
        )}
      </div>
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(list.map((s) => s.id)))}
                />
              </Th>
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
              <tr key={s.id} className={`${s.exitDate ? "text-slate-400" : ""} ${selected.has(s.id) ? "bg-orange-50" : ""}`}>
                <Td>
                  <input type="checkbox" aria-label={`Selecionar ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                </Td>
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
                <Td>
                  <RowActions onEdit={() => setEditing({ id: s.id, form: { ...empty, ...s } })} onDelete={() => askDelete([s])} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {deleting && (
        <ConfirmDelete
          title={deleting.length === 1 ? "Excluir criança" : `Excluir ${deleting.length} crianças`}
          busy={remove.isPending}
          error={deleteError}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting)}
        >
          <p>
            {deleting.length === 1 ? (
              <>Vai excluir <strong>{deleting[0].name}</strong></>
            ) : (
              <>Vai excluir <strong>{deleting.length} crianças</strong> ({deleting.slice(0, 5).map((s) => s.name).join(", ")}{deleting.length > 5 ? "…" : ""})</>
            )}{" "}
            do cadastro, junto com as faltas lançadas em todos os meses.
          </p>
          <p className="text-slate-500">
            Use a exclusão para cadastro de teste ou feito errado. Se a criança <strong>saiu do programa</strong>, em vez de excluir
            clique em Editar e preencha a <strong>data de saída</strong>: assim ela continua nos anexos dos meses em que estava matriculada.
          </p>
        </ConfirmDelete>
      )}

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
            <Field label="Entrega do material e uniforme" hint="Gera o Anexo V no mês da entrega">
              <Input type="date" {...field("materialDeliveredAt")} />
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
