import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bell, BarChart3, ArrowLeft, Shield, Scan, Users } from 'lucide-react';
import LanguageToggle from './LanguageToggle';
import { useApp } from '@/context/AppContext';

interface CaregiverLayoutProps {
  children: ReactNode;
  title?: string;
}

const tabs = [
  { path: '/caregiver', icon: LayoutDashboard, labelEn: 'Overview', labelHi: 'अवलोकन' },
  { path: '/caregiver/scan', icon: Scan, labelEn: 'Scan Rx', labelHi: 'स्कैन' },
  { path: '/caregiver/alerts', icon: Bell, labelEn: 'Alerts', labelHi: 'अलर्ट' },
  { path: '/caregiver/analytics', icon: BarChart3, labelEn: 'Analytics', labelHi: 'विश्लेषण' },
];

const CaregiverLayout = ({ children, title }: CaregiverLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, linkedSenior, activeSeniorName } = useApp();

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 gradient-hero text-primary-foreground sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="p-2 -ml-2 rounded-full hover:bg-primary-foreground/10 active:scale-95 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            <h1 className="text-lg font-extrabold truncate">
              {title || t('AURA Care Dashboard', 'आरा केयर डैशबोर्ड')}
            </h1>
          </div>
        </div>
        <LanguageToggle />
      </header>

      {/* Loved one info bar */}
      {linkedSenior ? (
        <div className="px-5 py-2 bg-card border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-muted-foreground">{t('Loved One:', 'अपने:')}</span>
            <span className="text-sm font-bold text-foreground">{activeSeniorName}</span>
          </div>
        </div>
      ) : (
        <div className="px-5 py-2 bg-warning/10 border-b border-warning/20">
          <p className="text-xs font-semibold text-warning text-center">
            {t('No loved one connected yet. Share your pairing code to connect.', 'अभी कोई अपना नहीं जुड़ा है। जोड़ने के लिए अपना पेयरिंग कोड साझा करें।')}
          </p>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-5 py-6 pb-24">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-card border-t border-border shadow-elevated z-40">
        <div className="flex justify-around py-2">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path;
            return (
              <button
                type="button"
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <tab.icon className={`w-5 h-5 ${isActive ? 'text-primary' : ''}`} />
                <span className="text-xs font-bold">{t(tab.labelEn, tab.labelHi)}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CaregiverLayout;
