import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const path =
  typeof window !== "undefined" ? window.location.pathname : "/";

const isStaffPath =
  path === "/login" ||
  path === "/snack" ||
  path.startsWith("/snack/") ||
  path === "/livreur" ||
  path === "/admin" ||
  path.startsWith("/admin/");

async function bootstrap() {
  if (isStaffPath) {
    if (path === "/snack" || path.startsWith("/snack/")) {
      const snackCss = document.createElement("link");
      snackCss.rel = "stylesheet";
      snackCss.href = "/snack-dashboard.css";
      document.head.appendChild(snackCss);

      void import("./qzAutoPrint.js");
      void import("./kitchenAutoPrint.js");
    }

    const { default: StaffApp } = await import("./StaffApp.jsx");

    createRoot(document.getElementById("root")).render(
      <StrictMode>
        <StaffApp />
      </StrictMode>,
    );
    return;
  }

  await import("./customerLocationGate.js");
  await import("./productImageFix.css");
  await import("./productImageFix.js");

  const { default: App } = await import("./App.jsx");

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
