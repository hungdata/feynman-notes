import { ToastContainer } from "react-toastify";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";

import MindMapPage from "./pages/MindMapPage";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/homePage";
import NotFound from "./pages/NotFound";
import AuthProvider from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedRoute><MindMapPage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/tasks" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>

          <ToastContainer />
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}

export default App;
