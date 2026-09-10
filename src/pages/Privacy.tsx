import { Shield } from 'lucide-react';

const CONTACT_EMAIL = 'verum.deeptrust@gmail.com';
const LAST_UPDATED = 'September 11, 2026';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <h2 className="text-lg font-bold text-foreground mb-2">{title}</h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
  </div>
);

// Google Play requires a privacy policy, linked from the store listing and
// reachable in-app, for any app that collects personal data — this one
// definitely does (health/medical info about a senior, on their caregiver's
// behalf). Kept as a plain public route (no auth) since Play's reviewers and
// prospective users need to read it without signing in.
const Privacy = () => (
  <div className="min-h-screen bg-background px-6 py-10">
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-6 h-6 text-primary" />
        <span className="font-black text-lg text-foreground">Kin Care</span>
      </div>
      <h1 className="text-2xl font-black text-foreground mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground mb-8">Last updated: {LAST_UPDATED}</p>

      <Section title="Who this covers">
        <p>
          Kin Care is an elderly-care coordination app with two roles: a "Dependant" (the senior
          being cared for) and one or more "Caregivers." This policy covers both the mobile app and
          this website.
        </p>
      </Section>

      <Section title="What we collect">
        <p><strong>Account information:</strong> name, email address, and phone number, via Clerk (our
          authentication provider).</p>
        <p><strong>Health and personal information</strong> a caregiver enters about the dependant:
          date of birth, gender, blood group, known medical conditions, allergies, regular
          medications, habits, and emergency contact details.</p>
        <p><strong>Medicine and wellbeing data:</strong> medicine names/dosages/schedules, whether
          doses were taken, meal logs, mood/wellbeing check-ins, and any photos of prescriptions
          scanned for automatic medicine entry.</p>
        <p><strong>Device and notification data:</strong> a push-notification token (web or native) so
          we can send medicine/meal reminders and alerts, and basic device information needed to
          deliver them.</p>
      </Section>

      <Section title="Why we collect it">
        <p>
          Solely to provide the app's core function: helping a caregiver track and support a
          dependant's medicines, meals, wellbeing, and to alert the caregiver when something needs
          attention (a missed dose, a period of inactivity, or an SOS). We do not use this
          information for advertising, and we do not sell it.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          Only the service providers that make the app work: Supabase (database hosting), Clerk
          (authentication), and, for push notifications, Google Firebase Cloud Messaging or a Web
          Push service. Data is shared with a caregiver's linked dependant(s) and vice versa, since
          that sharing is the app's purpose. We do not sell data to third parties or share it for
          advertising.
        </p>
      </Section>

      <Section title="Data retention and deletion">
        <p>
          We keep your data for as long as your account is active. You can permanently delete your
          account and all associated data at any time — in the app, under Settings &gt; Delete
          Account, or from any browser at{' '}
          <a href="/delete-account" className="text-primary underline">/delete-account</a>, even if
          you no longer have the app installed. Deleting your account removes your profile, medicine
          and wellbeing records, meal logs, alerts, and caregiver/dependant links. We may retain a
          minimal record for a limited time where required for fraud prevention, security, or legal
          compliance, after which it is deleted.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access, correct, or delete your personal information at any time through the app,
          or by contacting us at the email below.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Kin Care is intended for adult caregivers managing care for another adult. It is not
          directed at children, and we do not knowingly collect data from children.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we make material changes to this policy, we will update the "Last updated" date above
          and, where appropriate, notify users in the app.
        </p>
      </Section>

      <Section title="Contact us">
        <p>
          Questions about this policy or your data? Email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </div>
  </div>
);

export default Privacy;
