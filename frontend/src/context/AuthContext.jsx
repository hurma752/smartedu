// src/context/AuthContext.jsx
import { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as authApi from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  const navigate = useNavigate();

  const homeByRole = {
    admin: "/admin",
    teacher: "/teacher",
    student: "/student",
  };

  const loginUser = async (email, password) => {
    const { data } = await authApi.login({ email, password });

    const userData = {
      id: data.user_id,
      fullName: data.full_name,
      role: data.role,
    };

    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);

    navigate(homeByRole[userData.role] || "/login");
  };

  const registerUser = async (payload) => {
    const { data } = await authApi.register(payload);

    const userData = {
      id: data.user_id,
      fullName: data.full_name,
      role: data.role,
    };

    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);

    navigate(homeByRole[userData.role] || "/login");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loginUser, registerUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);