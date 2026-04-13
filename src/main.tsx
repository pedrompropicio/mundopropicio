import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { registerPWA } from "@/lib/pwa";
import "./index.css";

registerPWA();

createRoot(document.getElementById("root")!).render(<App />);
