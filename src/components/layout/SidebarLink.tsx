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
          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
          isActive
            ? "bg-white/12 text-white shadow-sm shadow-red-950/30 before:absolute before:left-0 before:top-2 before:h-6 before:w-1 before:rounded-full before:bg-signal"
            : "text-red-50/80 hover:bg-white/10 hover:text-white",
        ].join(" ")
      }
      onClick={onClick}
      to={to}
    >
      <Icon className="shrink-0 text-current" size={18} />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
