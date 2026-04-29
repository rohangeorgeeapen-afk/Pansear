import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { StationView } from "./pages/StationView";
import { ExpeditorView } from "./pages/ExpeditorView";
import { NewOrderForm } from "./pages/NewOrderForm";
import { Overview } from "./pages/Overview";
import { useEffect, useState } from "react";
import { useQueueState } from "./ws";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>{now.toLocaleString()}</span>;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  "pan-nav-link" + (isActive ? " is-active" : "");

function PendingBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="pan-nav-badge">{count}</span>;
}

const buildDate = "April 25, 2026";

export function App() {
  const queueState = useQueueState();
  const pendingByStation = new Map<number, number>(
    (queueState?.queues ?? []).map(q => [q.station_id, q.pending_count])
  );
  const pendingFor = (id: number) => pendingByStation.get(id) ?? 0;
  const totalPending = (queueState?.queues ?? []).reduce((a, q) => a + q.pending_count, 0);

  return (
    <div className="pan-shell">
      <header className="pan-nav">
        <div className="pan-brand">
          <img src="/pansearlogo.png" alt="Pansear logo" className="pan-brand-logo" />
          <div className="pan-brand-text">
            <span className="pan-brand-tag">Kitchen Operations System &mdash; v1.0</span>
          </div>
          <div className="pan-nav-spacer" />
          <div className="pan-nav-meta-top">
            Welcome, <b>kitchen-01</b><br />
            <Clock />
          </div>
        </div>
        <nav className="pan-nav-links">
          <NavLink to="/overview" className={navLinkClass}>
            Overview <PendingBadge count={totalPending} />
          </NavLink>
          <NavLink to="/expo" className={navLinkClass}>Expediter</NavLink>
          <NavLink to="/station/1" className={navLinkClass}>
            Grill Station <PendingBadge count={pendingFor(1)} />
          </NavLink>
          <NavLink to="/station/2" className={navLinkClass}>
            Fryer Station <PendingBadge count={pendingFor(2)} />
          </NavLink>
          <NavLink to="/station/3" className={navLinkClass}>
            Cold Station <PendingBadge count={pendingFor(3)} />
          </NavLink>
          <NavLink to="/new-order" className={navLinkClass}>New Order</NavLink>
        </nav>
      </header>

      <main className="pan-main">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/new-order" element={<NewOrderForm />} />
          <Route path="/expo" element={<ExpeditorView />} />
          <Route path="/station/:id" element={<StationView />} />
        </Routes>
      </main>

      <footer className="pan-statusbar">
        <div className="left">
          <span><span className={"led" + (queueState ? "" : " led-off")} />{queueState ? "Connected" : "Connecting..."}</span>
          <span>Build: {buildDate}</span>
        </div>
        <div className="right">
          &copy; 2026 Pansear Systems &mdash; All rights reserved.
        </div>
      </footer>
    </div>
  );
}
