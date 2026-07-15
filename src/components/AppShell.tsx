import type { PropsWithChildren } from "react";
import {
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  WalletCards,
  Wallet,
  HeartHandshake,
  ReceiptText,
} from "lucide-react";

const navigation = [
  ["Dashboard", LayoutDashboard],
  ["Bills", ReceiptText],
  ["Calendar", CalendarDays],
  ["Credit Cards", CreditCard],
  ["Subscriptions", WalletCards],
  ["Paydays", Wallet],
  ["Life Hub", HeartHandshake],
  ["History", History],
  ["Reports", Gauge],
  ["Documents", FileText],
  ["Settings", Settings],
] as const;

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-bird" aria-hidden="true">◆</div>
          <div>
            <strong>RavenBill</strong>
            <span>Life & bill planner</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigation.map(([label, Icon], index) => (
            <button className={index === 0 ? "nav-item active" : "nav-item"} key={label}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="paycheck-card">
          <span>Next Paycheck</span>
          <strong>In 4 days</strong>
          <small>Friday, July 19</small>
          <b>$2,850.00</b>
        </section>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu"><Menu size={21}/></button>
          <div className="mobile-brand"><span>◆</span><strong>RavenBill</strong></div>
          <label className="global-search">
            <Search size={17}/>
            <input placeholder="Search anything…" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications"><Bell size={19}/><span>3</span></button>
            <button className="avatar" aria-label="User profile">J</button>
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className="active"><LayoutDashboard size={19}/><span>Dashboard</span></button>
        <button><ReceiptText size={19}/><span>Bills</span></button>
        <button><CalendarDays size={19}/><span>Calendar</span></button>
        <button className="mobile-add" aria-label="Quick add"><Plus size={23}/></button>
        <button><History size={19}/><span>History</span></button>
        <button><Menu size={19}/><span>More</span></button>
      </nav>
    </div>
  );
}
