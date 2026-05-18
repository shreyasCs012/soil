import { createFileRoute } from "@tanstack/react-router";
import { SensorsPage } from "../components/agro/pages/SensorsPage";

export const Route = createFileRoute("/sensors")({
  head: () => ({
    meta: [
      { title: "Sensors — Smart Agro Dashboard" },
      { name: "description", content: "Detailed smart farm sensor readings with status indicators and historical trend visualization." },
      { property: "og:title", content: "Sensors — Smart Agro Dashboard" },
      { property: "og:description", content: "Review soil, nutrient, pH, and temperature sensor readings for every field zone." },
    ],
  }),
  component: SensorsPage,
});
