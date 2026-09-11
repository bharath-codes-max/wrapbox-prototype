import { MotionConfig, motion } from "motion/react";
import { useEffect } from "react";
import { Shell } from "./components/shell";
import { useRoute } from "./lib/router";
import { startLive, useStore } from "./lib/store";
import { AgentDetail, AgentsPage } from "./pages/agents";
import { Approvals } from "./pages/approvals";
import { ContractPage } from "./pages/contract";
import { EmployeeHome } from "./pages/employee";
import { Evidence } from "./pages/evidence";
import { FlowsPage } from "./pages/flows";
import { Gateway } from "./pages/gateway";
import { Overview } from "./pages/overview";
import { Locked, Team } from "./pages/team";
import { Welcome } from "./pages/welcome";
import { Start } from "./pages/start";
import { AdminSetup, EmployeeSetup } from "./pages/onboarding";
import { Playground } from "./pages/playground";

export default function App() {
  const route = useRoute();
  const role = useStore((s) => s.role);
  const theme = useStore((s) => s.theme);
  const workspace = useStore((s) => s.workspace);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => startLive(), []);

  const [path, qs] = route.split("?");
  const query = new URLSearchParams(qs ?? "");
  const seg = path.split("/").filter(Boolean);

  let page: React.ReactNode;
  switch (seg[0]) {
    case undefined:
      page = role === "admin" ? <Overview /> : <EmployeeHome />;
      break;
    case "welcome":
      page = <Welcome />;
      break;
    case "start":
      page = <Start />;
      break;
    case "onboarding":
      page = seg[1] === "employee" ? <EmployeeSetup key="emp" /> : <AdminSetup key="admin" />;
      break;
    case "agents":
      page = seg[1] ? <AgentDetail key={seg[1]} id={seg[1]} query={query} /> : <AgentsPage query={query} />;
      break;
    case "flows":
      page = <FlowsPage id={seg[1]} query={query} />;
      break;
    case "contract":
      page = <ContractPage query={query} />;
      break;
    case "playground":
      page = <Playground key={role} />;
      break;
    case "gateway":
      page = role === "admin" ? <Gateway /> : <Locked what="MCP gateway" />;
      break;
    case "approvals":
      page = <Approvals />;
      break;
    case "evidence":
      page = <Evidence />;
      break;
    case "team":
      page = role === "admin" ? <Team /> : <Locked what="Team & devices" />;
      break;
    default:
      page = <Overview />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <Shell current={path || "/"} focus={seg[0] === "onboarding"}>
        <motion.div key={(seg[0] === "onboarding" ? path : path + role) + workspace} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          {page}
        </motion.div>
      </Shell>
    </MotionConfig>
  );
}
