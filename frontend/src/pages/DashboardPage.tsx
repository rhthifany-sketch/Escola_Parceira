import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { usePeriod } from "../lib/period";
import { MONTHS, type OverviewRow } from "../lib/types";
import { MonthPicker } from "../components/Pickers";
import { Card, PageTitle, Td, Th } from "../components/ui";

export function DashboardPage() {
  const { year, month, set } = usePeriod();
  const { data, isLoading } = useQuery({
    queryKey: ["overview", year, month],
    queryFn: async () => (await api.get<OverviewRow[]>("/months/overview", { params: { year, month } })).data,
  });
  return (
    <>
      <PageTitle
        title="Painel do mês"
        description={`Situação de cada unidade em ${MONTHS[month - 1].toLowerCase()}/${year}. A prestação de contas vai para a prefeitura do 1º ao 5º dia útil do mês seguinte.`}
      />
      <div className="mb-4 flex flex-wrap gap-3">
        <MonthPicker year={year} month={month} onChange={set} />
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Unidade</Th>
              <Th className="text-right">Crianças</Th>
              <Th className="text-right">Dias letivos</Th>
              <Th>Frequência</Th>
              <Th className="text-right">Abaixo de 60%</Th>
              <Th className="text-right">Cadastro incompleto</Th>
              <Th className="text-right">Assinaturas completas</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <Td className="text-slate-500">Carregando…</Td>
              </tr>
            )}
            {data?.length === 0 && (
              <tr>
                <Td className="text-slate-500">Nenhuma unidade ativa.</Td>
              </tr>
            )}
            {data?.map((u) => (
              <tr key={u.unitId}>
                <Td className="font-medium">{u.unitName}</Td>
                <Td className="text-right">{u.students}</Td>
                <Td className="text-right">{u.schoolDays ?? "—"}</Td>
                <Td>
                  {u.attendanceSaved ? (
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Lançada</span>
                  ) : (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pendente</span>
                  )}
                </Td>
                <Td className={`text-right ${u.belowMinimum ? "font-semibold text-red-700" : ""}`}>{u.belowMinimum}</Td>
                <Td className={`text-right ${u.pendingRegistration ? "text-amber-700" : ""}`}>{u.pendingRegistration}</Td>
                <Td className="text-right">
                  <Link
                    className={u.students && u.signaturesComplete === u.students ? "text-green-700" : "text-slate-700 hover:underline"}
                    to={`/assinaturas?unidade=${u.unitId}&ano=${year}&mes=${month}`}
                  >
                    {u.signaturesComplete} de {u.students}
                  </Link>
                </Td>
                <Td className="text-right">
                  <Link className="text-orange-700 hover:underline" to={`/frequencia?unidade=${u.unitId}&ano=${year}&mes=${month}`}>
                    Abrir
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
