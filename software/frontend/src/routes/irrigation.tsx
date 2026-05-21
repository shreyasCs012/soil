import { createFileRoute } from "@tanstack/react-router";
import { IrrigationPage } from "../components/agro/pages/IrrigationPage";

export const Route = createFileRoute("/irrigation")({
  head: () => ({
    meta: [
      { title: "Irrigation — Smart Agro Dashboard" },
      { name: "description", content: "AI-powered fertigation control: manage fertilizer compartments, compute optimal mixes, and trigger irrigation with confirmation." },
      { property: "og:title", content: "Irrigation — Smart Agro Dashboard" },
    ],
  }),
  component: IrrigationPage,
});
