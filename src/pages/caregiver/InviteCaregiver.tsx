import { useState, useEffect } from 'react';
import { Copy, CheckCircle2, RefreshCw, Users, Lock, Crown, Clock3 } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';

const InviteCaregiver = () => {
  const { t, linkedCaregivers, isPrimaryCaregiver, generateCaregiverInviteCode, currentUserId, activeSeniorId } = useApp();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<db.DBCaregiverInviteCode[]>([]);

  useEffect(() => {
    if (!isPrimaryCaregiver) return;
    generateCaregiverInviteCode().then(code => { if (code) setInviteCode(code); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrimaryCaregiver]);

  useEffect(() => {
    if (!activeSeniorId) return;
    db.getPendingCaregiverInvites(activeSeniorId).then(setPendingInvites);
  }, [activeSeniorId, inviteCode]);

  const handleGenerateNew = async () => {
    setGenerating(true);
    try {
      const code = await generateCaregiverInviteCode();
      if (code) setInviteCode(code);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    toast({ title: t('Code copied!', 'कोड कॉपी हो गया!') });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CaregiverLayout title={t('Care Team', 'देखभाल टीम')}>
      <div className="space-y-4">
        {!isPrimaryCaregiver && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/60 border border-border">
            <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground">
              {t('Only the primary caregiver can invite others.', 'केवल मुख्य देखभालकर्ता ही दूसरों को आमंत्रित कर सकते हैं।')}
            </p>
          </div>
        )}

        {isPrimaryCaregiver && (
          <div className="glass-card rounded-2xl p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-black text-foreground mb-1">{t('Invite Another Caregiver', 'दूसरे देखभालकर्ता को आमंत्रित करें')}</h3>
            <p className="text-sm text-muted-foreground mb-5">
              {t('Share this code — they get read-only access alongside you.', 'यह कोड साझा करें — उन्हें आपके साथ केवल-पढ़ने की पहुँच मिलेगी।')}
            </p>

            <div
              onClick={handleCopy}
              className="bg-muted/60 rounded-2xl px-5 py-4 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between mb-3"
            >
              <span className="text-3xl font-black text-primary tracking-[0.25em] font-mono">
                {inviteCode || '------'}
              </span>
              {copied ? (
                <span className="flex items-center gap-1 text-success font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {t('Copied', 'कॉपी')}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground font-semibold text-sm">
                  <Copy className="w-4 h-4" /> {t('Copy', 'कॉपी')}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleGenerateNew}
              disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-bold text-sm disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              {t('Generate New Code', 'नया कोड बनाएं')}
            </button>
          </div>
        )}

        {pendingInvites.length > 0 && (
          <div>
            <h3 className="text-sm font-black text-foreground mb-3">{t('Pending Invites', 'लंबित आमंत्रण')}</h3>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div key={invite.code} className="glass-card rounded-2xl p-4 flex items-center gap-3 border border-dashed border-muted-foreground/30">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(invite.invitee_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-foreground text-sm">
                      {invite.invitee_name || t('Unnamed invite', 'बिना नाम का आमंत्रण')}
                      {invite.invitee_age ? ` · ${invite.invitee_age}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold">
                      {[invite.invitee_phone, invite.invitee_email].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted">
                    <Clock3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] font-black text-muted-foreground">{t('Pending', 'लंबित')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-black text-foreground mb-3">{t('Care Team Members', 'देखभाल टीम के सदस्य')}</h3>
          <div className="space-y-2">
            {linkedCaregivers.map((c) => (
              <div key={c.caregiverId} className="glass-card rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
                  {c.caregiverName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground text-sm">
                    {c.caregiverName}
                    {c.caregiverId === currentUserId && ` (${t('You', 'आप')})`}
                  </p>
                  <p className="text-xs text-muted-foreground font-semibold">
                    {c.isPrimary ? t('Full access', 'पूर्ण पहुँच') : t('Read-only', 'केवल-पढ़ने')}
                  </p>
                </div>
                {c.isPrimary && (
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning/10">
                    <Crown className="w-3 h-3 text-warning" />
                    <span className="text-[10px] font-black text-warning">{t('Primary', 'मुख्य')}</span>
                  </div>
                )}
              </div>
            ))}
            {linkedCaregivers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('No caregivers linked yet.', 'अभी कोई देखभालकर्ता नहीं जुड़ा।')}
              </p>
            )}
          </div>
        </div>
      </div>
    </CaregiverLayout>
  );
};

export default InviteCaregiver;
