import { BrowserRouter, Route, Routes } from "react-router-dom";
import { PublicFooter, PublicHeader } from "./components/SiteChrome";
import FarmerLayout from "./components/FarmerLayout";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import FarmerDashboard from "./pages/farmer/FarmerDashboard";
import FarmerCrops from "./pages/farmer/FarmerCrops";
import AddCrop from "./pages/farmer/AddCrop";
import FarmerOrders from "./pages/farmer/FarmerOrders";
import FarmerProfile from "./pages/farmer/FarmerProfile";

function PublicLayout({ children }) {
  return (
    <div className="site-shell">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PublicLayout>
              <Home />
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
        <Route path="/farmer" element={<FarmerLayout />}>
          <Route index element={<FarmerDashboard />} />
          <Route path="dashboard" element={<FarmerDashboard />} />
          <Route path="crops" element={<FarmerCrops />} />
          <Route path="add-crop" element={<AddCrop />} />
          <Route path="orders" element={<FarmerOrders />} />
          <Route path="profile" element={<FarmerProfile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
