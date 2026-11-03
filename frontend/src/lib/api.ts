import axios from "axios";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3333/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !String(err.config?.url).includes("/auth/login")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e.response?.data?.error ?? e.message ?? "Erro inesperado";
}

/** Baixa um arquivo da API (PDF/Excel) com o token. */
export async function download(url: string, params: Record<string, unknown>) {
  try {
    const res = await api.get(url, { params, responseType: "blob" });
    const disposition = String(res.headers["content-disposition"] ?? "");
    const name = decodeURIComponent(/filename="([^"]+)"/.exec(disposition)?.[1] ?? "arquivo");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(res.data);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (err) {
    // erro vem como blob: lê a mensagem do JSON
    const blob = (err as { response?: { data?: Blob } }).response?.data;
    if (blob instanceof Blob) {
      try {
        throw new Error(JSON.parse(await blob.text()).error);
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }
    throw err;
  }
}
