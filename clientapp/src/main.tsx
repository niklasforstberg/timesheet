import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import "./styles.css";
import { getToken } from "./api/client";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Tracker from "./pages/Tracker";
import Projects from "./pages/Projects";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

const signedIn = getToken() !== null;

const router = createBrowserRouter([
  { path: "/verify-email", element: <VerifyEmail /> },
  { path: "/forgot-password", element: <ForgotPassword /> },
  { path: "/reset-password", element: <ResetPassword /> },
  signedIn
    ? {
        path: "/",
        element: <Layout />,
        children: [
          { index: true, element: <Tracker /> },
          { path: "projects", element: <Projects /> },
          { path: "settings", element: <Settings /> },
        ],
      }
    : { path: "*", element: <Login /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
