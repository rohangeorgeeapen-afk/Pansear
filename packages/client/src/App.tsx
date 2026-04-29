import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Navbar, Alignment, Button } from "@blueprintjs/core";
import { StationView } from "./pages/StationView";
import { ExpeditorView } from "./pages/ExpeditorView";
import { NewOrderForm } from "./pages/NewOrderForm";

export function App() {
  return (
    <>
      <Navbar>
        <Navbar.Group align={Alignment.LEFT}>
          <Navbar.Heading>Kitchen</Navbar.Heading>
          <Navbar.Divider />
          <Link to="/new-order"><Button minimal icon="plus" text="New Order" /></Link>
          <Link to="/expo"><Button minimal icon="eye-open" text="Expo" /></Link>
          <Link to="/station/1"><Button minimal icon="flame" text="Grill" /></Link>
          <Link to="/station/2"><Button minimal icon="flame" text="Fryer" /></Link>
          <Link to="/station/3"><Button minimal icon="snowflake" text="Cold" /></Link>
        </Navbar.Group>
      </Navbar>
      <div style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/expo" replace />} />
          <Route path="/new-order" element={<NewOrderForm />} />
          <Route path="/expo" element={<ExpeditorView />} />
          <Route path="/station/:id" element={<StationView />} />
        </Routes>
      </div>
    </>
  );
}
