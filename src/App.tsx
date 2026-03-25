import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Show, SignIn, UserButton } from "@clerk/react";
import { Capacitor } from "@capacitor/core";
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
import { Shield, Heart, Users, ArrowLeft } from "lucide-react";

const isNative = Capacitor.isNativePlatform();

const queryClient = new QueryClient();

const AuthScreen = () => {
  const [showSignIn, setShowSignIn] = useState(false);

  const handleLogin = (role: 'senior' | 'caregiver') => {
    localStorage.setItem('pending_role', role);
    setShowSignIn(true);
  };

  // Show embedded Clerk SignIn form (renders inside the WebView, no redirect)
  if (showSignIn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/"
          appearance={isNative ? {
            elements: {
              // Hide Google/social OAuth buttons in mobile app (Google blocks WebView OAuth)
              socialButtonsBlockButton: { display: 'none' },
              socialButtonsBlockButtonArrow: { display: 'none' },
              dividerRow: { display: 'none' },
              socialButtonsProviderIcon: { display: 'none' },
              footer: { display: 'none' },
            },
          } : undefined}
        />
        {isNative && (
          <p className="text-xs text-muted-foreground mt-2 text-center px-4">
            Sign in with your email address and verification code
          </p>
        )}
        <button
          onClick={() => setShowSignIn(false)}
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground font-semibold py-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>
      </div>
    );
  }

  return (
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
        <button
          onClick={() => handleLogin('senior')}
          className="w-full elder-tile gradient-primary text-primary-foreground flex-col gap-2 text-elder-xl"
        >
          <Heart className="w-10 h-10" />
          Login as Dependant
        </button>
        <button
          onClick={() => handleLogin('caregiver')}
          className="w-full elder-tile bg-card text-foreground flex-col gap-2 text-elder-xl border-2 border-primary/20"
        >
          <Users className="w-10 h-10 text-primary" />
          Login as Caregiver
        </button>
      </div>
      <p className="text-xs text-muted-foreground mt-8 text-center">
        Made with ❤️ for India's elderly
      </p>
    </div>
  );
};

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
            <div className="fixed right-4 z-50" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'w-10 h-10',
                  },
                }}
              />
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
