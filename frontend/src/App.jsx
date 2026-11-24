import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ChatSocketProvider } from "./hooks/useChatSocket";
import { PublicFooter, PublicHeader } from "./components/SiteChrome";
import Login from "./pages/Login";
import Register from "./pages/Register";

const LazyHome = lazy(() => import("./pages/Home"));
const MotionRoute = lazy(() => import("./components/MotionRoute"));
const LazyFarmerLayout = lazy(() => import("./components/FarmerLayout"));
const LazyBuyerLayout = lazy(() => import("./components/BuyerLayout"));
const LazyFarmerDashboard = lazy(
  () => import("./pages/farmer/FarmerDashboard"),
);
const LazyFarmerCrops = lazy(() => import("./pages/farmer/FarmerCrops"));
const LazyAddCrop = lazy(() => import("./pages/farmer/AddCrop"));
const LazyFarmerOrders = lazy(() => import("./pages/farmer/FarmerOrders"));
const LazyFarmerProfile = lazy(() => import("./pages/farmer/FarmerProfile"));
const LazyBuyerDashboard = lazy(() => import("./pages/buyer/BuyerDashboard"));
const LazyBuyerMarketplace = lazy(
  () => import("./pages/buyer/BuyerMarketplace"),
);
const LazyBuyerCropDetails = lazy(
  () => import("./pages/buyer/BuyerCropDetails"),
);
const LazyBuyerOrders = lazy(() => import("./pages/buyer/BuyerOrders"));
const LazyBuyerProfile = lazy(() => import("./pages/buyer/BuyerProfile"));
const LazyPriceAssistant = lazy(
  () => import("./pages/shared/PriceAssistant"),
);
const LazyPriceHistory = lazy(() => import("./pages/shared/PriceHistory"));
const LazyPriceAnalytics = lazy(() => import("./pages/shared/PriceAnalytics"));
const LazyChatPage = lazy(() => import("./pages/shared/ChatPage"));
const LazyAdminPasswordChange = lazy(
  () => import("./pages/admin/AdminPasswordChange"),
);
const LazyAdminLayout = lazy(() => import("./components/AdminLayout"));
const LazyAdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const LazyAdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const LazyAdminActivity = lazy(() => import("./pages/admin/AdminActivity"));
const LazyAdminChatbot = lazy(() => import("./pages/admin/AdminChatbot"));
const LazyAdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const LazyAdminUserDetails = lazy(
  () => import("./pages/admin/AdminUserDetails"),
);

function RouteFallback() {
  return <div className="page-loading">Loading workspace…</div>;
}

function PublicLayout({ children }) {
  return (
    <div className="site-shell">
      <div aria-hidden="true" className="scroll-progress" />
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();

  return (
    <Suspense fallback={<RouteFallback />}>
      <MotionRoute pathname={location.pathname}>
        <Routes location={location}>
          <Route
            path="/"
            element={
              <PublicLayout>
                <LazyHome />
              </PublicLayout>
            }
          />
          <Route
            path="/login"
            element={
              <PublicLayout>
                <Login />
              </PublicLayout>
            }
          />
          <Route
            path="/register"
            element={
              <PublicLayout>
                <Register />
              </PublicLayout>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <LazyAdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyAdminOverview />} />
            <Route path="analytics" element={<LazyAdminAnalytics />} />
            <Route path="activity" element={<LazyAdminActivity />} />
            <Route path="chat" element={<LazyAdminChatbot />} />
            <Route path="users" element={<LazyAdminUsers />} />
            <Route path="users/:userId" element={<LazyAdminUserDetails />} />
          </Route>
          <Route
            path="/admin/change-password"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <LazyAdminPasswordChange />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer"
            element={
              <ProtectedRoute allowedRoles={["farmer"]}>
                <ChatSocketProvider>
                  <LazyFarmerLayout />
                </ChatSocketProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyFarmerDashboard />} />
            <Route path="dashboard" element={<LazyFarmerDashboard />} />
            <Route path="crops" element={<LazyFarmerCrops />} />
            <Route path="add-crop" element={<LazyAddCrop />} />
            <Route path="crops/:cropId/edit" element={<LazyAddCrop />} />
            <Route path="orders" element={<LazyFarmerOrders />} />
            <Route path="chat" element={<LazyChatPage />} />
            <Route path="chat/:conversationId" element={<LazyChatPage />} />
            <Route path="price-history" element={<LazyPriceHistory />} />
            <Route path="price-analytics" element={<LazyPriceAnalytics />} />
            <Route path="price-assistant" element={<LazyPriceAssistant />} />
            <Route path="profile" element={<LazyFarmerProfile />} />
          </Route>
          <Route
            path="/buyer"
            element={
              <ProtectedRoute allowedRoles={["buyer"]}>
                <ChatSocketProvider>
                  <LazyBuyerLayout />
                </ChatSocketProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyBuyerDashboard />} />
            <Route path="dashboard" element={<LazyBuyerDashboard />} />
            <Route path="marketplace" element={<LazyBuyerMarketplace />} />
            <Route path="crop/:id" element={<LazyBuyerCropDetails />} />
            <Route path="orders" element={<LazyBuyerOrders />} />
            <Route path="chat" element={<LazyChatPage />} />
            <Route path="chat/:conversationId" element={<LazyChatPage />} />
            <Route path="price-history" element={<LazyPriceHistory />} />
            <Route path="price-analytics" element={<LazyPriceAnalytics />} />
            <Route path="price-assistant" element={<LazyPriceAssistant />} />
            <Route path="profile" element={<LazyBuyerProfile />} />
          </Route>
        </Routes>
      </MotionRoute>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    const updateScrollProgress = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      document.documentElement.style.setProperty(
        "--scroll-progress",
        `${progress}%`,
      );
    };

    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollProgress);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
