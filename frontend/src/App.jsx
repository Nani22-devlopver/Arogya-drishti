import { Navigate, Route, Routes } from "react-router-dom";
import { currentUser } from "./api";
import { Guard } from "./Layout";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Patients from "./pages/Patients";
import Register from "./pages/Register";
import PatientProfile from "./pages/PatientProfile";
import Reviews from "./pages/Reviews";
import Referrals from "./pages/Referrals";
import Appointments from "./pages/Appointments";
import Video from "./pages/Video";
import Investigations from "./pages/Investigations";
import NavigatorPage from "./pages/NavigatorPage";
import Dashboard from "./pages/Dashboard";
import AuditPage from "./pages/AuditPage";
import Notes from "./pages/Notes";
import OfflinePage from "./pages/OfflinePage";
import AdminPending from "./pages/AdminPending";
import AdminUsers from "./pages/AdminUsers";

export default function App() {
  const user = currentUser();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Home /></Guard>} />
      <Route path="/patients" element={<Guard roles={["health_worker", "medical_officer", "specialist"]}><Patients /></Guard>} />
      <Route path="/patients/:id" element={<Guard roles={["health_worker", "medical_officer", "specialist"]}><PatientProfile /></Guard>} />
      <Route path="/register" element={<Guard roles={["health_worker"]}><Register /></Guard>} />
      <Route path="/reviews" element={<Guard roles={["medical_officer"]}><Reviews /></Guard>} />
      <Route path="/referrals" element={<Guard roles={["specialist", "medical_officer", "navigator"]}><Referrals /></Guard>} />
      <Route path="/appointments" element={<Guard roles={["specialist", "navigator", "medical_officer", "health_worker"]}><Appointments /></Guard>} />
      <Route path="/video/:id" element={<Guard roles={["specialist", "health_worker", "medical_officer"]}><Video /></Guard>} />
      <Route path="/investigations" element={<Guard roles={["specialist", "medical_officer"]}><Investigations /></Guard>} />
      <Route path="/navigator" element={<Guard roles={["navigator"]}><NavigatorPage /></Guard>} />
      <Route path="/dashboard" element={<Guard roles={["admin", "medical_officer"]}><Dashboard /></Guard>} />
      <Route path="/audit" element={<Guard roles={["admin", "medical_officer"]}><AuditPage /></Guard>} />
      <Route path="/admin/pending" element={<Guard roles={["admin"]}><AdminPending /></Guard>} />
      <Route path="/admin/users" element={<Guard roles={["admin"]}><AdminUsers /></Guard>} />
      <Route path="/notifications" element={<Guard><Notes /></Guard>} />
      <Route path="/offline" element={<Guard roles={["health_worker"]}><OfflinePage /></Guard>} />
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
    </Routes>
  );
}
