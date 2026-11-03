import { NavLink, Outlet } from "react-router-dom";
import { Building2, CalendarCheck, LayoutDashboard, LogOut, Users, Baby, Utensils } from "lucide-react";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout } = useAuth();
  const links = [
    { to: "/", label: "Painel do mês", icon: LayoutDashboard },
    { to: "/frequencia", label: "Frequência e anexos", icon: CalendarCheck },
    { to: "/criancas", label: "Crianças", icon: Baby },
    { to: "/cardapio", label: "Cardápio", icon: Utensils },
    ...(user?.role === "FINANCEIRO"
      ? [
          { to: "/unidades", label: "Unidades", icon: Building2 },
          { to: "/usuarios", label: "Usuários", icon: Users },
        ]
      : []),
  ];
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-60 md:border-b-0 md:border-r">
        <div className="px-4 py-4">
          <div className="text-base font-bold text-orange-600">Escola Parceira</div>
          <div className="text-xs text-slate-500">Prestação de contas · Niterói</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-orange-50 font-medium text-orange-700" : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-100 px-4 py-3 text-xs text-slate-500 md:block">
          <div className="font-medium text-slate-700">{user?.name}</div>
          <div>{user?.role === "FINANCEIRO" ? "Financeiro" : "Gestor"}</div>
          <button onClick={logout} className="mt-2 inline-flex items-center gap-1 text-slate-600 hover:text-slate-900">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
