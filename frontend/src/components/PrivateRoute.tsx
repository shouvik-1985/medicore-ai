// src/components/PrivateRoute.tsx
import { Navigate } from "react-router-dom";

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem("access_token");
  return token ? <>{children}</> : <Navigate to="/login" />;
};

export default PrivateRoute;
