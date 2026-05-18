import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../components/agro/pages/DashboardPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Agro Dashboard" },
      { name: "description", content: "Monitor soil moisture, pH, NPK nutrients, alerts, weather, and irrigation controls for smarter farming." },
      { property: "og:title", content: "Smart Agro Dashboard" },
      { property: "og:description", content: "A farmer-friendly agro-advisory system dashboard with sensor insights and recommendations." },
    ],
  }),
  component: DashboardPage,
});
