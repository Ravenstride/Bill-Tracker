import {
  CalendarDays,
  Car,
  CreditCard,
  DollarSign,
  Droplets,
  Home,
  Plus,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

const today = [
  { icon: Home, title: "Housing", detail: "Due today", amount: "$1,250.00", badge: "Due Today", tone: "green" },
  { icon: CalendarDays, title: "Dentist Appointment", detail: "2:00 PM · Dr. Smith", amount: "2:00 PM", badge: "", tone: "purple" },
  { icon: CreditCard, title: "Capital One", detail: "Credit Card · Due tomorrow", amount: "$125.00", badge: "Due Tomorrow", tone: "blue" },
];

const upcoming = [
  { icon: Zap, title: "Electric", date: "Jul 18", amount: "$110.00", tone: "orange" },
  { icon: DollarSign, title: "Payday", date: "Fri, Jul 19", amount: "$2,850.00", tone: "green" },
  { icon: Repeat2, title: "Netflix", date: "Jul 20", amount: "$15.49", tone: "red" },
  { icon: Droplets, title: "Water", date: "Jul 22", amount: "$75.00", tone: "blue" },
  { icon: Car, title: "Truck Registration", date: "Jul 25", amount: "$60.00", tone: "purple" },
];

const timeline = [
  { group: "TODAY · JUL 15", time: "2:00 PM", title: "Dentist Appointment", detail: "Dr. Smith", amount: "", tone: "purple" },
  { group: "", time: "ALL DAY", title: "Housing", detail: "Bill Due", amount: "$1,250.00", tone: "green" },
  { group: "TOMORROW · JUL 16", time: "", title: "Capital One", detail: "Credit Card Due", amount: "$125.00", tone: "orange" },
  { group: "FRIDAY · JUL 19", time: "", title: "Payday", detail: "Main Checking", amount: "$2,850.00", tone: "green" },
  { group: "NEXT WEEK", time: "Jul 18", title: "Electric", detail: "Bill Due", amount: "$110.00", tone: "orange" },
  { group: "", time: "Jul 20", title: "Netflix", detail: "Subscription", amount: "$15.49", tone: "red" },
];

export function Dashboard() {
  return (
    <div className="dashboard-page">
      <section className="welcome-row">
        <div>
          <h1>Good Morning, Joseph <span>👋</span></h1>
          <p>Wednesday, July 15</p>
        </div>
      </section>

      <section className="metric-grid">
        <Metric value="3" label="Bills Due" detail="$624.50" tone="green" icon={<Home size={20}/>} />
        <Metric value="1" label="Appointment" detail="Today" tone="purple" icon={<CalendarDays size={20}/>} />
        <Metric value="1" label="Subscription" detail="Due Soon" tone="orange" icon={<Repeat2 size={20}/>} />
        <Metric value="1" label="Payday" detail="In 4 days" tone="blue" icon={<DollarSign size={20}/>} />
      </section>

      <section className="dashboard-layout">
        <div className="dashboard-content">
          <div className="two-column-cards">
            <Panel title="Today" action="View all">
              <div className="agenda-list">
                {today.map(({ icon: Icon, ...item }) => <AgendaItem key={item.title} icon={<Icon size={18}/>} {...item} />)}
              </div>
              <button className="panel-link">View today's full schedule <span>→</span></button>
            </Panel>

            <Panel title="Upcoming" action="View all">
              <div className="simple-list">
                {upcoming.map(({ icon: Icon, ...item }) => (
                  <div className="simple-row" key={item.title}>
                    <span className={`mini-icon ${item.tone}`}><Icon size={14}/></span>
                    <strong>{item.title}</strong>
                    <span>{item.date}</span>
                    <b>{item.amount}</b>
                  </div>
                ))}
              </div>
              <button className="panel-link">View all upcoming <span>→</span></button>
            </Panel>
          </div>

          <div className="analytics-grid">
            <Panel title="Monthly Progress" subtitle="July 1 – July 31">
              <div className="progress-card">
                <div className="ring"><strong>82%</strong><span>of bills paid</span></div>
                <dl>
                  <div><dt>Paid</dt><dd>$2,276.50</dd></div>
                  <div><dt>Remaining</dt><dd>$624.50</dd></div>
                  <div><dt>Total</dt><dd>$2,901.00</dd></div>
                </dl>
              </div>
              <button className="panel-link">View full report <span>→</span></button>
            </Panel>

            <Panel title="Spending Overview" subtitle="This Month">
              <div className="donut-row">
                <div className="donut" />
                <ul>
                  <li><i className="dot housing"/>Housing <b>$1,250.00</b></li>
                  <li><i className="dot utilities"/>Utilities <b>$235.00</b></li>
                  <li><i className="dot cards"/>Credit Cards <b>$215.00</b></li>
                  <li><i className="dot subscriptions"/>Subscriptions <b>$75.48</b></li>
                  <li><i className="dot other"/>Other <b>$150.02</b></li>
                </ul>
              </div>
              <button className="panel-link">View full report <span>→</span></button>
            </Panel>

            <Panel title="Top Categories" subtitle="This Month">
              <div className="category-list">
                <span><i className="dot housing"/>Housing <b>43%</b></span>
                <span><i className="dot utilities"/>Utilities <b>18%</b></span>
                <span><i className="dot cards"/>Credit Cards <b>16%</b></span>
                <span><i className="dot subscriptions"/>Subscriptions <b>10%</b></span>
                <span><i className="dot other"/>Other <b>13%</b></span>
              </div>
              <button className="panel-link">View full report <span>→</span></button>
            </Panel>
          </div>

          <div className="bottom-grid">
            <Panel title="Quick Add">
              <div className="quick-add-grid">
                <QuickAdd icon={<Sparkles size={18}/>} label="Add Bill" tone="purple" />
                <QuickAdd icon={<CalendarDays size={18}/>} label="Appointment" tone="blue" />
                <QuickAdd icon={<Repeat2 size={18}/>} label="Subscription" tone="orange" />
                <QuickAdd icon={<DollarSign size={18}/>} label="Payday" tone="green" />
                <QuickAdd icon={<ShieldCheck size={18}/>} label="Reminder" tone="blue" />
              </div>
            </Panel>
            <Panel title="Recently Paid" action="View all">
              <div className="recent-list"><span>Internet <b>$70.00</b></span><span>Gym Membership <b>$45.00</b></span><span>Phone Bill <b>$85.00</b></span></div>
            </Panel>
            <Panel title="Alerts" action="View all">
              <div className="alert-list"><span className="danger">2 bills are overdue</span><span className="warning">1 subscription renewing soon</span><span className="purple">1 appointment today</span></div>
            </Panel>
          </div>
        </div>

        <aside className="timeline-panel">
          <div className="panel-heading"><h2>Timeline</h2><button><Plus size={15}/> Add</button></div>
          <div className="timeline">
            {timeline.map((item, index) => <TimelineItem key={`${item.title}-${index}`} {...item} />)}
          </div>
          <button className="panel-link timeline-link">View full calendar <span>→</span></button>
        </aside>
      </section>
    </div>
  );
}

function Metric({ value, label, detail, tone, icon }:{ value:string; label:string; detail:string; tone:string; icon:React.ReactNode }) {
  return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span><b>{detail}</b></div></article>;
}

function Panel({ title, subtitle, action, children }:{ title:string; subtitle?:string; action?:string; children:React.ReactNode }) {
  return <section className="panel"><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <small>{subtitle}</small>}</div>{action && <button className="text-action">{action}</button>}</div>{children}</section>;
}

function AgendaItem({ icon, title, detail, amount, badge, tone }:{ icon:React.ReactNode; title:string; detail:string; amount:string; badge:string; tone:string }) {
  return <div className="agenda-item"><span className={`agenda-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><div className="agenda-amount"><b>{amount}</b>{badge && <em className={`status-badge ${tone}`}>{badge}</em>}</div></div>;
}

function TimelineItem({ group, time, title, detail, amount, tone }:{ group:string; time:string; title:string; detail:string; amount:string; tone:string }) {
  return <div className="timeline-item">{group && <div className="timeline-group">{group}</div>}<span className={`timeline-dot ${tone}`}/><div className="timeline-time">{time}</div><div className="timeline-copy"><strong>{title}</strong><small>{detail}</small></div><b>{amount}</b></div>;
}

function QuickAdd({ icon, label, tone }:{ icon:React.ReactNode; label:string; tone:string }) {
  return <button className={`quick-add-card ${tone}`}><span>{icon}</span><b>{label}</b></button>;
}
