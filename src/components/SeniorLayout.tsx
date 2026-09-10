import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import VoiceAssistantButton from './VoiceAssistantButton';
import LanguageToggle from './LanguageToggle';
import { useApp } from '@/context/AppContext';

interface SeniorLayoutProps {
  children: ReactNode;
  title?: string;
  showBack?: boolean;
}

const SeniorLayout = ({ children, title, showBack = false }: SeniorLayoutProps) => {
  const navigate = useNavigate();
  const { t, role, loading } = useApp();

  // Same guard as CaregiverLayout: no role yet means nothing to show here.
  useEffect(() => {
    if (!loading && role === null) navigate('/', { replace: true });
  }, [loading, role, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      {/* pr-14 (not px-5) — the app-wide UserButton avatar floats fixed in
          the top-right corner (see App.tsx), so the header's own right-side
          controls need extra clearance to avoid sitting underneath it. */}
      <header className="flex items-center justify-between pl-5 pr-14 py-3.5 bg-card/95 backdrop-blur-md border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
              <ArrowLeft className="w-6 h-6 text-foreground" />
            </button>
          ) : (
            <img src="/logo.jpg" alt="Kin Care" className="h-8" />
          )}
          {(showBack || title) && (
            <h1 className="text-lg font-extrabold text-foreground truncate">
              {title || t('Kin Care', 'किन केयर')}
            </h1>
          )}
        </div>
        <LanguageToggle />
      </header>

      {/* Content */}
      <main className="flex-1 px-5 py-6 pb-24">
        {children}
      </main>

      <VoiceAssistantButton />
    </div>
  );
};

export default SeniorLayout;
