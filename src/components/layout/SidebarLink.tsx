import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

type SidebarLinkProps = {
  to: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

export function SidebarLink({ to, icon: Icon, label, onClick }: SidebarLinkProps) {
  return (
    <NavLink
      className={({ isActive }) =>
        [
          "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition",
          isActive
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-300 hover:bg-white/10 hover:text-white",
        ].join(" ")
      }
      onClick={onClick}
      to={to}
    >
      <Icon size={18} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
