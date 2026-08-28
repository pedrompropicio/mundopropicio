import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerPWA } from "@/lib/pwa";
import { startVersionCheck } from "@/lib/versionCheck";
import "./index.css";

registerPWA();
startVersionCheck();

createRoot(document.getElementById("root")!).render(<App />);
