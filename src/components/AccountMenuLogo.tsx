import { UserButton } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { useApp } from '@/context/AppContext';

interface AccountMenuLogoProps {
  className?: string;
}

// The Kin Care logo doubles as the account menu trigger — replaces the
// separate floating avatar that used to sit in the top-right corner on
// every page. The real Clerk <UserButton> is rendered here too (its own
// avatar made invisible via `opacity-0`, but still the actual clickable
// element — not a fake), stacked exactly over the visible logo, so tapping
// the logo opens Clerk's real account menu with our own "Dashboard" entry
// added to it.
const AccountMenuLogo = ({ className = 'h-8' }: AccountMenuLogoProps) => {
  const navigate = useNavigate();
  const { role, t } = useApp();
  const dashboardPath = role === 'caregiver' ? '/caregiver' : '/senior';

  return (
    <div className="relative inline-flex">
      <img src="/logo.jpg" alt="Kin Care" className={className} />
      <div className="absolute inset-0 opacity-0">
        <UserButton
          appearance={{
            elements: {
              userButtonBox: 'w-full h-full',
              userButtonTrigger: 'w-full h-full',
              userButtonAvatarBox: 'w-full h-full',
            },
          }}
        >
          <UserButton.MenuItems>
            <UserButton.Action
              label={t('Dashboard', 'डैशबोर्ड')}
              labelIcon={<LayoutDashboard className="w-4 h-4" />}
              onClick={() => navigate(dashboardPath)}
            />
          </UserButton.MenuItems>
        </UserButton>
      </div>
    </div>
  );
};

export default AccountMenuLogo;
