import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
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
            path="/farmer"
            element={
              <ProtectedRoute allowedRoles={["farmer"]}>
                <LazyFarmerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyFarmerDashboard />} />
            <Route path="dashboard" element={<LazyFarmerDashboard />} />
            <Route path="crops" element={<LazyFarmerCrops />} />
            <Route path="add-crop" element={<LazyAddCrop />} />
            <Route path="orders" element={<LazyFarmerOrders />} />
            <Route path="profile" element={<LazyFarmerProfile />} />
          </Route>
          <Route
            path="/buyer"
            element={
              <ProtectedRoute allowedRoles={["buyer"]}>
                <LazyBuyerLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyBuyerDashboard />} />
            <Route path="dashboard" element={<LazyBuyerDashboard />} />
            <Route path="marketplace" element={<LazyBuyerMarketplace />} />
            <Route path="crop/:id" element={<LazyBuyerCropDetails />} />
            <Route path="orders" element={<LazyBuyerOrders />} />
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
