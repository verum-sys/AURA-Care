import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { Show, SignUpButton, UserButton, useClerk } from "@clerk/react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { AppProvider } from "@/context/AppContext";
import SsoCallback from "./pages/SsoCallback";
import DeleteAccount from "./pages/DeleteAccount";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Welcome from "./pages/senior/Welcome";
import DailyCheckIn from "./pages/senior/DailyCheckIn";
import Home from "./pages/senior/Home";
import Medicines from "./pages/senior/Medicines";
import Meals from "./pages/senior/Meals";
import Wellbeing from "./pages/senior/Wellbeing";
import Overview from "./pages/caregiver/Overview";
import Alerts from "./pages/caregiver/Alerts";
import RemoteControls from "./pages/caregiver/RemoteControls";
import Analytics from "./pages/caregiver/Analytics";
import PrescriptionScan from "./pages/caregiver/PrescriptionScan";
import Routine from "./pages/caregiver/Routine";
import PatientDetails from "./pages/caregiver/PatientDetails";
import InviteCaregiver from "./pages/caregiver/InviteCaregiver";
import Onboarding from "./pages/caregiver/Onboarding";
import CardDetail from "./pages/caregiver/CardDetail";
import MedicineHistory from "./pages/shared/MedicineHistory";
import { Shield, Heart, Users } from "lucide-react";

const queryClient = new QueryClient();

// Where Google (or any other OAuth) sends the browser back to after
// consent. Must be a custom URL scheme, not an https:// URL — inside the
// packaged app, Google's sign-in has to open in a real external browser
// (Capacitor's default for any off-app domain, and also Google's own
// policy — it blocks rendering its consent screen inside an embedded
// WebView), and a real browser can never resolve Capacitor's internal
// https://localhost origin. The scheme below is registered as an Android
// intent-filter (see android/app/src/main/AndroidManifest.xml) so the OS
// hands the redirect back to this app instead of trying a real fetch.
// This exact URL must also be added to the Clerk Dashboard's allowed
// redirect URLs or Clerk will reject the callback.
const NATIVE_OAUTH_REDIRECT_URL = 'com.kincare.app://sso-callback';

// One role's auth entry point. On native, Google is the primary, obvious
// action (the only thing proven to work in the packaged app) and email is a
// secondary link — Clerk's own popup has no supported way to hide its
// built-in (broken, on native) Google button, so the fix here is ordering:
// make the working path the one people naturally tap first. Web is
// untouched — the popup has always worked correctly there.
const RoleAuthOption = ({
  role,
  label,
  icon,
  tileClassName,
}: {
  role: 'senior' | 'caregiver';
  label: string;
  icon: ReactNode;
  tileClassName: string;
}) => {
  const clerk = useClerk();
  const isNative = Capacitor.isNativePlatform();

  const handleLogin = () => {
    localStorage.setItem('pending_role', role);
  };

  const handleGoogleNative = async () => {
    handleLogin();
    await clerk.client.signUp.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: NATIVE_OAUTH_REDIRECT_URL,
      redirectUrlComplete: '/',
    });
  };

  if (isNative) {
    return (
      <div className="w-full flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={handleGoogleNative}
          className={`w-full elder-tile ${tileClassName} flex-col gap-1 text-elder-xl`}
        >
          {icon}
          <span>{label}</span>
          <span className="text-sm font-semibold opacity-90">Continue with Google</span>
        </button>
        <SignUpButton mode="modal">
          <button
            type="button"
            onClick={handleLogin}
            className="text-sm font-bold text-primary underline underline-offset-2 pb-2"
          >
            or sign up as {label} with email
          </button>
        </SignUpButton>
      </div>
    );
  }

  return (
    <SignUpButton mode="modal">
      <button
        onClick={handleLogin}
        className={`w-full elder-tile ${tileClassName} flex-col gap-2 text-elder-xl`}
      >
        {icon}
        Login as {label}
      </button>
    </SignUpButton>
  );
};

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
      <RoleAuthOption
        role="senior"
        label="Dependant"
        icon={<Heart className="w-10 h-10" />}
        tileClassName="gradient-primary text-primary-foreground"
      />
      <RoleAuthOption
        role="caregiver"
        label="Caregiver"
        icon={<Users className="w-10 h-10 text-primary" />}
        tileClassName="bg-card text-foreground border-2 border-primary/20"
      />
    </div>
    <p className="text-xs text-muted-foreground mt-8 text-center">
      Made with ❤️ for India's elderly
    </p>
  </div>
);

// Bridges Android's deep-link callback (the OS reopening the app via the
// custom scheme above) into an in-app navigation to /sso-callback carrying
// the same query params — from there Clerk's own <AuthenticateWithRedirectCallback>
// (SsoCallback.tsx) takes over exactly as it would for a normal web redirect.
const NativeOAuthBridge = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(NATIVE_OAUTH_REDIRECT_URL)) return;
      const { search, hash } = new URL(url);
      navigate(`/sso-callback${search}${hash}`, { replace: true });
    });
    return () => { listener.then(l => l.remove()); };
  }, [navigate]);

  return null;
};

const AppRoutes = () => {
  const location = useLocation();

  // Reachable regardless of sign-in state — the OAuth handshake completes
  // here before a session necessarily exists yet.
  if (location.pathname === '/sso-callback') {
    return <SsoCallback />;
  }

  // Google Play's account-deletion policy requires this to work for a user
  // who may not currently be signed in at all (e.g. uninstalled the app) —
  // it handles both signed-in and signed-out states internally.
  if (location.pathname === '/delete-account') {
    return <DeleteAccount />;
  }

  return (
    <>
      <NativeOAuthBridge />
      <Show when="signed-out">
        <AuthScreen />
      </Show>
      <Show when="signed-in">
        <div className="fixed top-3 right-3 z-50">
          <UserButton />
        </div>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/senior" element={<Welcome />} />
          <Route path="/senior/checkin" element={<DailyCheckIn />} />
          <Route path="/senior/home" element={<Home />} />
          <Route path="/senior/medicines" element={<Medicines />} />
          <Route path="/senior/meals" element={<Meals />} />
          <Route path="/senior/wellbeing" element={<Wellbeing />} />
          <Route path="/caregiver" element={<Analytics />} />
          <Route path="/caregiver/onboarding" element={<Onboarding />} />
          <Route path="/caregiver/detail/:kind" element={<CardDetail />} />
          <Route path="/caregiver/scan" element={<PrescriptionScan />} />
          <Route path="/caregiver/alerts" element={<Alerts />} />
          <Route path="/caregiver/controls" element={<RemoteControls />} />
          <Route path="/caregiver/settings" element={<Overview />} />
          <Route path="/caregiver/routine" element={<Routine />} />
          <Route path="/caregiver/patient-details" element={<PatientDetails />} />
          <Route path="/caregiver/invite" element={<InviteCaregiver />} />
          <Route path="/history" element={<MedicineHistory />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Show>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
