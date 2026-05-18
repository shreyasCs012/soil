import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage } from "../components/agro/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Create Account — Smart Agro Advisory System" }],
  }),
  component: RegisterPage,
});
