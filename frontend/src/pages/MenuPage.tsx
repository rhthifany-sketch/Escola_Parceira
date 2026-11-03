import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Save } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { usePeriod } from "../lib/period";
import { UnitPicker } from "../components/Pickers";
import { Alert, Button, Card, PageTitle } from "../components/ui";

type Menu = Record<string, Record<string, Record<string, string[]>>>;
const WEEKS = ["A", "B", "C", "D"];
const AGES = [
  { key: "0", label: "0 ano" },
  { key: "1", label: "1 ano" },
  { key: "2a5", label: "2 a 5 anos" },
];
const MEALS = [
  { key: "desjejum", label: "Desjejum" },
  { key: "almoco", label: "Almoço" },
];
const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

export function MenuPage() {
  const { unitId, set } = usePeriod();
  const queryClient = useQueryClient();
  const [week, setWeek] = useState("A");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const { data } = useQuery({
    queryKey: ["menu", unitId],
    enabled: !!unitId,
    queryFn: async () => (await api.get<Menu>(`/units/${unitId}/menu`)).data,
  });
  useEffect(() => {
    if (data) setMenu(structuredClone(data));
    setMessage(null);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => api.put(`/units/${unitId}/menu`, menu),
    onSuccess: () => {
      setMessage({ tone: "success", text: "Cardápio salvo. Ele vale para todos os meses até ser mudado." });
      queryClient.invalidateQueries({ queryKey: ["menu", unitId] });
      queryClient.invalidateQueries({ queryKey: ["month"] });
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err) }),
  });

  const setValue = (age: string, meal: string, day: number, value: string) =>
    setMenu((m) => {
      if (!m) return m;
      const next = structuredClone(m);
      next[week][age][meal][day] = value;
      return next;
    });
  const copyFromA = () =>
    setMenu((m) => {
      if (!m) return m;
      const next = structuredClone(m);
      next[week] = structuredClone(m.A);
      return next;
    });

  return (
    <>
      <PageTitle
        title="Cardápio da unidade"
        description="Cardápio das semanas A, B, C e D (GREI 0 ao 5), como no Anexo XI. Preencha uma vez: ele é reaproveitado todo mês, e o Anexo XI já sai com o cálculo da alimentação (alunos × R$ 10,90 × dias letivos)."
        actions={
          <Button onClick={() => save.mutate()} disabled={!menu || save.isPending}>
            <Save size={16} /> {save.isPending ? "Salvando…" : "Salvar cardápio"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <UnitPicker value={unitId} onChange={(id) => set({ unitId: id })} />
      </div>
      {message && <div className="mb-4"><Alert tone={message.tone}>{message.text}</Alert></div>}
      {menu && (
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 pt-3">
            {WEEKS.map((w) => (
              <button
                key={w}
                onClick={() => setWeek(w)}
                className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-medium ${week === w ? "border-orange-600 text-orange-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
              >
                Semana {w}
              </button>
            ))}
            {week !== "A" && (
              <button onClick={copyFromA} className="ml-auto mb-2 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
                <Copy size={14} /> Copiar da semana A
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2">Idade</th>
                  <th className="px-3 py-2">Refeição</th>
                  {DAYS.map((d) => (
                    <th key={d} className="px-2 py-2">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AGES.map((a) =>
                  MEALS.map((m, mi) => (
                    <tr key={a.key + m.key} className={mi === 1 ? "border-b border-slate-200" : ""}>
                      {mi === 0 && (
                        <td rowSpan={2} className="px-3 py-2 align-middle font-medium">{a.label}</td>
                      )}
                      <td className="px-3 py-2 text-slate-600">{m.label}</td>
                      {DAYS.map((d, i) => (
                        <td key={d} className="px-1 py-1">
                          <textarea
                            aria-label={`${a.label} ${m.label} ${d}`}
                            rows={2}
                            value={menu[week][a.key][m.key][i]}
                            onChange={(e) => setValue(a.key, m.key, i, e.target.value)}
                            className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-orange-500"
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
