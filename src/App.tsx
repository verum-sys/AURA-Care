import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { AppProvider } from "@/context/AppContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Welcome from "./pages/senior/Welcome";
import Home from "./pages/senior/Home";
import Medicines from "./pages/senior/Medicines";
import Meals from "./pages/senior/Meals";
import Wellbeing from "./pages/senior/Wellbeing";
import Overview from "./pages/caregiver/Overview";
import Alerts from "./pages/caregiver/Alerts";
import RemoteControls from "./pages/caregiver/RemoteControls";
import Analytics from "./pages/caregiver/Analytics";
import PrescriptionScan from "./pages/caregiver/PrescriptionScan";
import MedicineHistory from "./pages/shared/MedicineHistory";
import { Shield } from "lucide-react";

const queryClient = new QueryClient();

const AuthScreen = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-md mx-auto">
    <div className="mb-2">
      <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center shadow-glow-primary mx-auto">
        <Shield className="w-10 h-10 text-primary-foreground" />
      </div>
    </div>
    <h1 className="text-elder-2xl font-black text-foreground text-center mt-5">
      Kin Care
    </h1>
    <p className="text-muted-foreground text-center font-semibold mt-2">
      Intelligent Support for Independent Living
    </p>
    <div className="w-full mt-10 space-y-4 flex flex-col items-center">
      <SignInButton mode="modal">
        <button className="w-full elder-tile gradient-primary text-primary-foreground flex-col gap-2 text-elder-xl">
          Sign In
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="w-full elder-tile bg-card text-foreground flex-col gap-2 text-elder-xl border-2 border-primary/20">
          Sign Up
        </button>
      </SignUpButton>
    </div>
    <p className="text-xs text-muted-foreground mt-8 text-center">
      Made with ❤️ for India's elderly
    </p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Show when="signed-out">
          <AuthScreen />
        </Show>
        <Show when="signed-in">
          <BrowserRouter>
            <div className="fixed top-3 right-3 z-50">
              <UserButton />
            </div>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/senior" element={<Welcome />} />
              <Route path="/senior/home" element={<Home />} />
              <Route path="/senior/medicines" element={<Medicines />} />
              <Route path="/senior/meals" element={<Meals />} />
              <Route path="/senior/wellbeing" element={<Wellbeing />} />
              <Route path="/caregiver" element={<Overview />} />
              <Route path="/caregiver/scan" element={<PrescriptionScan />} />
              <Route path="/caregiver/alerts" element={<Alerts />} />
              <Route path="/caregiver/controls" element={<RemoteControls />} />
              <Route path="/caregiver/analytics" element={<Analytics />} />
              <Route path="/history" element={<MedicineHistory />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </Show>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
