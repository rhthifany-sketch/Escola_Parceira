import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import type { Role } from "../lib/types";
import { useUnits } from "../components/Pickers";
import { Alert, Button, Card, Field, Input, Modal, PageTitle, Select, Td, Th } from "../components/ui";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  unitId: string | null;
  active: boolean;
  unit: { name: string } | null;
}
type Form = { name: string; email: string; role: Role; unitId: string; password: string; active: boolean };

export function UsersPage() {
  const queryClient = useQueryClient();
  const { data: units } = useUnits();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get<UserRow[]>("/users")).data });
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const f = editing!.form;
      const body = { ...f, unitId: f.role === "GESTOR" ? f.unitId : null, password: f.password || undefined };
      return editing!.id ? api.put(`/users/${editing!.id}`, body) : api.post("/users", body);
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const set = (patch: Partial<Form>) => setEditing((ed) => ed && { ...ed, form: { ...ed.form, ...patch } });
  return (
    <>
      <PageTitle
        title="Usuários"
        description="Gestores lançam a frequência e cuidam do cadastro só da unidade deles. O financeiro vê todas as unidades."
        actions={
          <Button
            onClick={() => {
              setError("");
              setEditing({ id: null, form: { name: "", email: "", role: "GESTOR", unitId: units?.[0]?.id ?? "", password: "", active: true } });
            }}
          >
            <Plus size={16} /> Novo usuário
          </Button>
        }
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>E-mail</Th>
              <Th>Perfil</Th>
              <Th>Unidade</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <Td className="font-medium">{u.name}{!u.active && " (inativo)"}</Td>
                <Td>{u.email}</Td>
                <Td>{u.role === "FINANCEIRO" ? "Financeiro" : "Gestor"}</Td>
                <Td>{u.unit?.name ?? "Todas"}</Td>
                <Td className="text-right">
                  <button
                    className="text-slate-500 hover:text-slate-900"
                    aria-label="Editar"
                    onClick={() => {
                      setError("");
                      setEditing({ id: u.id, form: { name: u.name, email: u.email, role: u.role, unitId: u.unitId ?? "", password: "", active: u.active } });
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing && (
        <Modal title={editing.id ? "Editar usuário" : "Novo usuário"} onClose={() => setEditing(null)}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Nome">
              <Input value={editing.form.name} onChange={(e) => set({ name: e.target.value })} required />
            </Field>
            <Field label="E-mail (login)">
              <Input type="email" value={editing.form.email} onChange={(e) => set({ email: e.target.value })} required />
            </Field>
            <Field label="Perfil">
              <Select value={editing.form.role} onChange={(e) => set({ role: e.target.value as Role })}>
                <option value="GESTOR">Gestor de unidade</option>
                <option value="FINANCEIRO">Financeiro</option>
              </Select>
            </Field>
            {editing.form.role === "GESTOR" && (
              <Field label="Unidade">
                <Select value={editing.form.unitId} onChange={(e) => set({ unitId: e.target.value })} required>
                  {units?.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={editing.id ? "Nova senha (deixe vazio para manter)" : "Senha"} hint="Mínimo 6 caracteres">
              <Input type="password" value={editing.form.password} onChange={(e) => set({ password: e.target.value })} required={!editing.id} minLength={6} />
            </Field>
            {editing.id && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.form.active} onChange={(e) => set({ active: e.target.checked })} /> Usuário ativo
              </label>
            )}
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
