import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Unit } from "../lib/types";
import { useUnits } from "../components/Pickers";
import { Alert, Button, Card, ConfirmDelete, Field, Input, Modal, PageTitle, RowActions, Td, Th } from "../components/ui";

type Form = Pick<Unit, "name" | "legalName" | "cnpj" | "legalRepName" | "legalRepCpf" | "active">;
const empty: Form = { name: "", legalName: "", cnpj: "", legalRepName: "", legalRepCpf: "", active: true };

export function UnitsPage() {
  const { data: units } = useUnits();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<{ unit: Unit; usage: { students: number; months: number; users: number } } | null>(null);
  const [message, setMessage] = useState("");
  const remove = useMutation({
    mutationFn: (u: Unit) => api.delete(`/units/${u.id}`),
    onSuccess: (_r, u) => {
      setDeleting(null);
      setMessage(`Unidade ${u.name} excluída.`);
      queryClient.invalidateQueries();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const askDelete = async (unit: Unit) => {
    setError("");
    setMessage("");
    try {
      const usage = (await api.get(`/units/${unit.id}/usage`)).data;
      setDeleting({ unit, usage });
    } catch (err) {
      setMessage(errorMessage(err));
    }
  };
  const save = useMutation({
    mutationFn: async () => (editing!.id ? api.put(`/units/${editing!.id}`, editing!.form) : api.post("/units", editing!.form)),
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const field = (key: keyof Form) => ({
    value: String(editing!.form[key]),
    onChange: (e: { target: { value: string } }) => setEditing((ed) => ed && { ...ed, form: { ...ed.form, [key]: e.target.value } }),
    required: true,
  });
  return (
    <>
      <PageTitle
        title="Unidades"
        description="Escolas do programa. A razão social, o CNPJ e o representante legal saem nos Anexos I, III e X."
        actions={
          <Button onClick={() => { setError(""); setEditing({ id: null, form: { ...empty } }); }}>
            <Plus size={16} /> Nova unidade
          </Button>
        }
      />
      {message && <div className="mb-4"><Alert tone="success">{message}</Alert></div>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Unidade</Th>
              <Th>Instituição / CNPJ</Th>
              <Th>Representante legal</Th>
              <Th className="text-right">Crianças</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {units?.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <Td className="font-medium">{u.name}{!u.active && " (inativa)"}</Td>
                <Td>
                  {u.legalName}
                  <div className="text-xs text-slate-500">{u.cnpj}</div>
                </Td>
                <Td>
                  {u.legalRepName}
                  <div className="text-xs text-slate-500">CPF {u.legalRepCpf}</div>
                </Td>
                <Td className="text-right">{u._count?.students ?? 0}</Td>
                <Td>
                  <RowActions
                    onEdit={() => { setError(""); setEditing({ id: u.id, form: { ...u } }); }}
                    onDelete={() => askDelete(u)}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {deleting && (
        <ConfirmDelete
          title="Excluir unidade"
          typeToConfirm={deleting.unit.name}
          busy={remove.isPending}
          error={error}
          onClose={() => setDeleting(null)}
          onConfirm={() => remove.mutate(deleting.unit)}
        >
          <p>
            Vai excluir a unidade <strong>{deleting.unit.name}</strong> e tudo o que está ligado a ela:
          </p>
          <ul className="list-disc pl-5">
            <li>{deleting.usage.students} criança(s) cadastrada(s)</li>
            <li>{deleting.usage.months} mês(es) com frequência lançada</li>
            <li>{deleting.usage.users} gestor(es) dessa unidade (o login deles deixa de existir)</li>
          </ul>
          <p className="text-slate-500">
            Se a unidade só saiu do programa, prefira <strong>Editar</strong> e desmarcar “Unidade ativa”: assim o histórico fica guardado.
          </p>
        </ConfirmDelete>
      )}
      {editing && (
        <Modal title={editing.id ? "Editar unidade" : "Nova unidade"} onClose={() => setEditing(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Nome da unidade (como vocês chamam)">
              <Input {...field("name")} />
            </Field>
            <Field label="CNPJ">
              <Input {...field("cnpj")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Razão social da instituição">
                <Input {...field("legalName")} />
              </Field>
            </div>
            <Field label="Representante legal">
              <Input {...field("legalRepName")} />
            </Field>
            <Field label="CPF do representante">
              <Input {...field("legalRepCpf")} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.form.active}
                onChange={(e) => setEditing((ed) => ed && { ...ed, form: { ...ed.form, active: e.target.checked } })}
              />
              Unidade ativa no programa
            </label>
            <div className="sm:col-span-2"><Alert>{error}</Alert></div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>Salvar</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
