import { useSearchParams } from "react-router-dom";

/** Mês/ano/unidade escolhidos ficam na URL (dá pra mandar o link pra alguém). */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  // padrão: o mês anterior (é o que se presta conta no começo do mês)
  const fallback = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = Number(params.get("ano")) || fallback.getFullYear();
  const month = Number(params.get("mes")) || fallback.getMonth() + 1;
  const unitId = params.get("unidade") ?? "";
  const set = (patch: { year?: number; month?: number; unitId?: string }) => {
    const next = new URLSearchParams(params);
    if (patch.year !== undefined) next.set("ano", String(patch.year));
    if (patch.month !== undefined) next.set("mes", String(patch.month));
    if (patch.unitId !== undefined) next.set("unidade", patch.unitId);
    setParams(next, { replace: true });
  };
  return { year, month, unitId, set };
}
