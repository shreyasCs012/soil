import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "../components/agro/pages/LoginPage";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In — Smart Agro Advisory System" }],
  }),
  component: LoginPage,
});
