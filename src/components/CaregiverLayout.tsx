import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bell, BarChart3, ArrowLeft, Scan, Heart } from 'lucide-react';
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
  { path: '/caregiver/analytics', icon: BarChart3, labelEn: 'Insights', labelHi: 'विश्लेषण' },
];

const CaregiverLayout = ({ children, title }: CaregiverLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, linkedSenior, activeSeniorName, dynamicAlerts } = useApp();

  const criticalCount = dynamicAlerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3.5 bg-card border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
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
        <LanguageToggle />
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
          {tabs.map((tab) => {
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
