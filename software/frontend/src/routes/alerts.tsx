import { createFileRoute } from "@tanstack/react-router";
import { AlertsPage } from "../components/agro/pages/AlertsPage";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — Smart Agro Dashboard" },
      { name: "description", content: "Prioritized smart farm alerts for irrigation, fertilizer, and soil condition actions." },
      { property: "og:title", content: "Alerts — Smart Agro Dashboard" },
      { property: "og:description", content: "Act quickly on smart agro alerts ranked by field urgency and recommended action." },
    ],
  }),
  component: AlertsPage,
});
