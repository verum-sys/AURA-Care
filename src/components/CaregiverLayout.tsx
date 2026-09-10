import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bell, Settings, ArrowLeft, Scan, Heart } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { useApp } from '@/context/AppContext';

interface CaregiverLayoutProps {
  children: ReactNode;
  title?: string;
}

const tabs = [
  { path: '/caregiver', icon: LayoutDashboard, labelEn: 'Home', labelHi: 'होम' },
  { path: '/caregiver/scan', icon: Scan, labelEn: 'Scan', labelHi: 'स्कैन' },
  { path: '/caregiver/alerts', icon: Bell, labelEn: 'Alerts', labelHi: 'अलर्ट' },
  { path: '/caregiver/settings', icon: Settings, labelEn: 'Settings', labelHi: 'सेटिंग्स' },
];

const CaregiverLayout = ({ children, title }: CaregiverLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, role, loading, linkedSenior, activeSeniorName, dynamicAlerts, isPrimaryCaregiver } = useApp();

  // A signed-in user with no role yet (fresh account, or a data reset) has
  // nothing to show here — send them to the start screen to pick one rather
  // than rendering a half-initialised page.
  useEffect(() => {
    if (!loading && role === null) navigate('/', { replace: true });
  }, [loading, role, navigate]);

  const criticalCount = dynamicAlerts.filter(a => a.severity === 'critical').length;
  const unreadCount = dynamicAlerts.filter(a => !a.isRead).length;
  const visibleTabs = isPrimaryCaregiver ? tabs : tabs.filter(tab => tab.path !== '/caregiver/scan');

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      {/* pr-14 (not px-5) — the app-wide UserButton avatar floats fixed in
          the top-right corner (see App.tsx), so the header's own right-side
          controls need extra clearance to avoid sitting underneath it. */}
      <header className="flex items-center justify-between pl-5 pr-14 py-3.5 bg-card border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.jpg" alt="Kin Care" className="h-7" />
            {linkedSenior && (
              <div className="flex items-center gap-1 ml-1">
                <Heart className="w-3 h-3 text-primary" />
                <span className="text-[11px] font-bold text-primary">{activeSeniorName}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/caregiver/alerts')}
            className="relative p-2 rounded-full hover:bg-muted active:scale-95 transition-all"
            aria-label={t('Alerts', 'अलर्ट')}
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <LanguageToggle />
        </div>
      </header>

      {/* Warning if not connected */}
      {!linkedSenior && (
        <div className="px-5 py-2.5 bg-warning/8 border-b border-warning/15">
          <p className="text-xs font-semibold text-warning text-center">
            {t('No loved one connected yet. Share your pairing code to connect.', 'अभी कोई अपना नहीं जुड़ा है। जोड़ने के लिए अपना पेयरिंग कोड साझा करें।')}
          </p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-5 py-5 pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-card/95 backdrop-blur-md border-t border-border z-40">
        <div className="flex justify-around py-1.5">
          {visibleTabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            const showBadge = tab.path === '/caregiver/alerts' && criticalCount > 0;
            return (
              <button
                type="button"
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-1.5 w-5 h-1 rounded-full gradient-primary" />
                )}
                <tab.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : ''}`}>
                  {t(tab.labelEn, tab.labelHi)}
                </span>
                {showBadge && (
                  <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-destructive animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CaregiverLayout;
