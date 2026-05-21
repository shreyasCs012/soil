import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { Bell, Droplets, Gauge, LogOut, RadioTower, Settings, Sprout } from "lucide-react";
import { useEffect, useState } from "react";
import { logout, tryRestoreSession, type UserData } from "../services/api";

import appCss from "../styles.css?url";

// Routes that don't require authentication
const AUTH_ROUTES = new Set(["/login", "/register"]);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Smart Agro — Advisory System" },
      { name: "description", content: "Smart Agro — advisory dashboard for farm sensors, weather, and recommendations." },
      { name: "theme-color", content: "#0f172a" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const isAuthRoute = AUTH_ROUTES.has(pathname);

  const [user, setUser] = useState<UserData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Skip auth check on login / register pages
    if (isAuthRoute) {
      setChecked(true);
      return;
    }

    let cancelled = false;

    (async () => {
      const restoredUser = await tryRestoreSession();
      if (cancelled) return;

      if (!restoredUser) {
        navigate({ to: "/login", replace: true });
        setChecked(true);
        return;
      }

      setUser(restoredUser);
      setChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Don't render anything until auth check completes (avoids flash of protected content)
  if (!checked) return null;

  // Auth pages get no nav shell
  if (isAuthRoute) return <Outlet />;

  const navItems = [
    { to: "/" as const,           label: "Dashboard",  icon: Gauge },
    { to: "/sensors" as const,    label: "Sensors",    icon: RadioTower },
    { to: "/alerts" as const,     label: "Alerts",     icon: Bell },
    { to: "/irrigation" as const, label: "Irrigation", icon: Droplets },
    { to: "/settings" as const,   label: "Settings",   icon: Settings },
  ];

  const farmName = user?.farms?.[0]?.name ?? "My Farm";
  const farmerName = user?.farmer_name ?? user?.username ?? "";

  async function handleLogout() {
    await logout();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <Link to="/" className="brand-mark" aria-label="Smart Agro dashboard home">
          <span className="brand-icon">
            <Sprout className="h-4 w-4" />
          </span>
          <span>
            <strong>Smart Agro</strong>
            <small>Advisory System</small>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="nav-link"
              activeOptions={{ exact: item.to === "/" }}
              activeProps={{ className: "nav-link nav-link-active" }}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {farmerName && (
          <div className="nav-user-area">
            <div className="nav-farmer">
              <span className="nav-farmer-name">{farmerName}</span>
              <span className="nav-farm-tag">{farmName}</span>
            </div>
            <button
              className="nav-logout"
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
