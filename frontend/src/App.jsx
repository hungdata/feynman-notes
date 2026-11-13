import { lazy, Suspense } from "react";
import { ToastContainer } from "react-toastify";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";

import MindMapPage from "./pages/MindMapPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

// The learning section is loaded on demand so the mind map opens fast.
const LearnPage = lazy(() => import("./pages/LearnPage"));
const CoursePage = lazy(() => import("./pages/CoursePage"));
const LessonPage = lazy(() => import("./pages/LessonPage"));
const CampusPage = lazy(() => import("./pages/CampusPage"));
const ChecklistPage = lazy(() => import("./pages/ChecklistPage"));
const MindMapHallPage = lazy(() => import("./pages/MindMapHallPage"));
const ArcadePage = lazy(() => import("./pages/ArcadePage"));
const PoolPage = lazy(() => import("./pages/PoolPage"));
const Campus3DPage = lazy(() => import("./pages/Campus3DPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const FootballPage = lazy(() => import("./pages/FootballPage"));
const BasketballPage = lazy(() => import("./pages/BasketballPage"));
import AuthProvider from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Suspense fallback={null}>{children}</Suspense> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ProtectedRoute><CampusPage /></ProtectedRoute>} />
            <Route path="/mindmap" element={<ProtectedRoute><MindMapPage /></ProtectedRoute>} />
            <Route path="/mindmaps" element={<ProtectedRoute><MindMapHallPage /></ProtectedRoute>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/learn" element={<ProtectedRoute><LearnPage /></ProtectedRoute>} />
            <Route path="/san-truong-3d" element={<Suspense fallback={null}><Campus3DPage /></Suspense>} />
            <Route path="/bong-da" element={<Suspense fallback={null}><FootballPage /></Suspense>} />
            <Route path="/bong-ro" element={<Suspense fallback={null}><BasketballPage /></Suspense>} />
            <Route path="/nha" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/giai-tri" element={<ProtectedRoute><ArcadePage /></ProtectedRoute>} />
            <Route path="/giai-tri/bida" element={<ProtectedRoute><PoolPage /></ProtectedRoute>} />
            <Route path="/schools/:school" element={<ProtectedRoute><LearnPage key="school" /></ProtectedRoute>} />
            <Route path="/learn/:courseId" element={<ProtectedRoute><CoursePage /></ProtectedRoute>} />
            <Route path="/learn/:courseId/:lessonId" element={<ProtectedRoute><LessonPage /></ProtectedRoute>} />
            <Route path="/tasks" element={<ProtectedRoute><ChecklistPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>

          <ToastContainer />
        </BrowserRouter>
      </AuthProvider>
    </>
  );
}

export default App;
