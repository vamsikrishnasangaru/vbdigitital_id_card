'use client';

import { useAuthStore } from '@/stores/auth-store';
import { Settings as SettingsIcon, User, Lock, Bell, Globe } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const tabs = [
    { label: 'Profile', icon: User },
    { label: 'Password', icon: Lock },
    { label: 'Alerts', icon: Bell },
    { label: 'System', icon: Globe },
  ];

  return (
    <div className="space-y-6">
      <div><h2 className="text-2xl font-bold tracking-tight">Settings</h2><p className="text-sm text-muted-foreground mt-0.5">Update your profile and account settings.</p></div>
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-2 space-y-0.5 h-fit">
          {tabs.map(t => (
            <button key={t.label} className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors text-left">
              <t.icon className="h-4 w-4 text-muted-foreground" />{t.label}
            </button>
          ))}
        </div>
        <div className="lg:col-span-3 rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4">Your Profile</h3>
          <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
            {[{ label: 'First Name', value: user?.firstName }, { label: 'Last Name', value: user?.lastName }, { label: 'Email', value: user?.email }, { label: 'Role', value: user?.role?.replace('_',' ') }].map(f => (
              <div key={f.label}><label className="text-sm font-medium text-muted-foreground mb-1 block">{f.label}</label>
              <input defaultValue={f.value || ''} className="w-full px-3 py-2 border rounded-lg text-sm bg-background focus:ring-2 focus:ring-primary/30 focus:outline-none" readOnly={f.label === 'Role'} /></div>
            ))}
          </div>
          <button className="mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">Save Changes</button>
        </div>
      </div>
    </div>
  );
}
