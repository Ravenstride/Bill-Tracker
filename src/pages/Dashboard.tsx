import { CalendarDays, CreditCard, DollarSign, Home, Plus, Repeat2 } from "lucide-react";

const today = [
  { icon: Home, title: "Housing", detail: "Due today", amount: "$1,250.00", tone: "green" },
  { icon: CalendarDays, title: "Dentist Appointment", detail: "2:00 PM · Dr. Smith", amount: "2:00 PM", tone: "purple" },
  { icon: CreditCard, title: "Capital One", detail: "Credit card · Due tomorrow", amount: "$125.00", tone: "blue" }
];

const upcoming = [
  { title: "Electric", date: "Jul 18", amount: "$110.00" },
  { title: "Payday", date: "Jul 19", amount: "$2,850.00" },
  { title: "Netflix", date: "Jul 20", amount: "$15.49" },
  { title: "Truck Registration", date: "Jul 25", amount: "$60.00" }
];

export function Dashboard() {
  return (
    <div className="dashboard-page">
      <section className="welcome-row"><div><h1>Good Morning, Joseph <span>👋</span></h1><p>Wednesday, July 15</p></div></section>
      <section className="metric-grid">
        <Metric value="3" label="Bills Due" detail="$624.50" tone="green" icon={<Home size={20}/>}/>
        <Metric value="1" label="Appointment" detail="Today" tone="purple" icon={<CalendarDays size={20}/>}/>
        <Metric value="1" label="Subscription" detail="Due Soon" tone="orange" icon={<Repeat2 size={20}/>}/>
        <Metric value="1" label="Payday" detail="In 4 days" tone="blue" icon={<DollarSign size={20}/>}/>
      </section>
      <section className="dashboard-main-grid">
        <div className="dashboard-center">
          <div className="two-column-cards">
            <Panel title="Today" action="View all">
              <div className="agenda-list">{today.map(({icon: Icon, ...item}) => <AgendaItem key={item.title} icon={<Icon size={19}/>} {...item}/>)}</div>
            </Panel>
            <Panel title="Upcoming" action="View all">
              <div className="simple-list">{upcoming.map(item => <div className="simple-row" key={item.title}><strong>{item.title}</strong><span>{item.date}</span><b>{item.amount}</b></div>)}</div>
            </Panel>
          </div>
          <div className="analytics-grid">
            <Panel title="Monthly Progress"><div className="progress-card"><div className="ring"><strong>82%</strong><span>of bills paid</span></div><dl><div><dt>Paid</dt><dd>$2,276.50</dd></div><div><dt>Remaining</dt><dd>$624.50</dd></div><div><dt>Total</dt><dd>$2,901.00</dd></div></dl></div></Panel>
            <Panel title="Spending Overview"><div className="donut-row"><div className="donut"/><ul><li>Housing $1,250</li><li>Utilities $235</li><li>Credit Cards $215</li><li>Subscriptions $75</li></ul></div></Panel>
            <Panel title="Top Categories"><div className="category-list"><span>Housing <b>43%</b></span><span>Utilities <b>18%</b></span><span>Credit Cards <b>16%</b></span><span>Subscriptions <b>10%</b></span></div></Panel>
          </div>
        </div>
        <aside className="timeline-panel">
          <div className="panel-heading"><h2>Timeline</h2><button><Plus size={16}/> Add</button></div>
          <div className="timeline"><TimelineItem when="TODAY · JUL 15" title="Dentist Appointment" detail="2:00 PM · Dr. Smith"/><TimelineItem when="ALL DAY" title="Housing" detail="Bill due · $1,250.00"/><TimelineItem when="TOMORROW · JUL 16" title="Capital One" detail="Credit card due · $125.00"/><TimelineItem when="FRIDAY · JUL 19" title="Payday" detail="Main checking · $2,850.00"/><TimelineItem when="NEXT WEEK" title="Electric" detail="Bill due · $110.00"/></div>
        </aside>
      </section>
    </div>
  );
}

function Metric({value,label,detail,tone,icon}:{value:string;label:string;detail:string;tone:string;icon:React.ReactNode}) { return <article className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><strong>{value}</strong><span>{label}</span><b>{detail}</b></div></article>; }
function Panel({title,action,children}:{title:string;action?:string;children:React.ReactNode}) { return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{action && <button>{action}</button>}</div>{children}</section>; }
function AgendaItem({icon,title,detail,amount,tone}:{icon:React.ReactNode;title:string;detail:string;amount:string;tone:string}) { return <div className="agenda-item"><span className={`agenda-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><b>{amount}</b></div>; }
function TimelineItem({when,title,detail}:{when:string;title:string;detail:string}) { return <div className="timeline-item"><span className="timeline-dot"/><div><small>{when}</small><strong>{title}</strong><p>{detail}</p></div></div>; }
