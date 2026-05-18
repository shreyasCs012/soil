import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "../components/agro/pages/SettingsPage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Smart Agro Dashboard" },
      { name: "description", content: "Configure agro-advisory thresholds, notifications, and simulated irrigation control." },
      { property: "og:title", content: "Settings — Smart Agro Dashboard" },
      { property: "og:description", content: "Adjust moisture, pH, and NPK thresholds and manage irrigation status." },
    ],
  }),
  component: SettingsPage,
});
