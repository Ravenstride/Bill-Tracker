import type { PropsWithChildren } from "react";
import { Bell, CalendarDays, CreditCard, FileText, Gauge, History, LayoutDashboard, Menu, Plus, Search, Settings, WalletCards } from "lucide-react";

const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Bills", FileText],
  ["Calendar", CalendarDays],
  ["Credit Cards", CreditCard],
  ["Subscriptions", WalletCards],
  ["Paydays", Gauge],
  ["Life Hub", History],
  ["Reports", Gauge],
  ["Documents", FileText],
  ["Settings", Settings]
] as const;

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">RB</div><div><strong>RavenBill</strong><span>Life & bill planner</span></div></div>
        <nav>{navigation.map(([label, Icon], index) => <button className={index === 0 ? "nav-item active" : "nav-item"} key={label}><Icon size={18}/><span>{label}</span></button>)}</nav>
        <section className="paycheck-card"><span>Next paycheck</span><strong>In 4 days</strong><small>Friday, July 19</small><b>$2,850.00</b></section>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu"><Menu size={20}/></button>
          <label className="global-search"><Search size={18}/><input placeholder="Search anything…"/></label>
          <div className="topbar-actions"><button className="icon-button" aria-label="Notifications"><Bell size={19}/><span>3</span></button><button className="avatar">J</button></div>
        </header>
        {children}
      </main>
      <button className="mobile-add" aria-label="Quick add"><Plus size={24}/></button>
    </div>
  );
}
