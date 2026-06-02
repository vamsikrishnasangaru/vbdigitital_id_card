'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { cn, resolveMediaUrl } from '@/lib/utils';
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Building2,
  Bell,
  Loader2,
  Shield,
  Mail,
  Phone,
  GraduationCap,
} from 'lucide-react';

type SettingsTab = 'profile' | 'password' | 'account';

interface ProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  isActive: boolean;
  schoolId: string | null;
  school: { id: string; name: string; code: string; logoUrl?: string | null } | null;
  createdAt: string;
  _count?: { teacherAssignments: number };
}

function formatRole(role?: string) {
  if (!role) return '—';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser, logout } = useAuthStore();
  const [tab, setTab] = useState<SettingsTab>('profile');

  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: async () => {
      const { data } = await api.get<ProfileResponse>('/auth/profile');
      return data;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phone: profile.phone || '',
    });
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch<ProfileResponse>('/auth/profile', {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim() || undefined,
      });
      return data;
    },
    onSuccess: (data) => {
      setUser({
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role as 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER',
        schoolId: data.schoolId,
        school: data.school
          ? {
              id: data.school.id,
              name: data.school.name,
              code: data.school.code,
              ...(data.school.logoUrl ? { logoUrl: data.school.logoUrl } : {}),
            }
          : null,
      });
      void queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] });
      toast.success('Profile updated');
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('Passwords do not match');
      }
      if (passwordForm.newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters');
      }
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
    },
    onSuccess: () => {
      toast.success('Password updated. Please sign in again.');
      logout();
      router.push('/login');
    },
    onError: (err: unknown) => {
      if (err instanceof Error && !('response' in err)) {
        toast.error(err.message);
        return;
      }
      const apiErr = err as { response?: { data?: { message?: string } } };
      toast.error(apiErr.response?.data?.message || 'Failed to change password');
    },
  });

  const tabs: { id: SettingsTab; label: string; icon: typeof User }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'account', label: 'Account', icon: Building2 },
  ];

  const inputClass =
    'w-full px-4 py-3 bg-background border border-border rounded-xl text-sm font-medium focus:ring-4 focus:ring-primary/10 focus:border-primary/50 outline-none transition-all';

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500 pb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em]">
          <SettingsIcon className="h-3.5 w-3.5" />
          Account
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground font-medium">
          Manage your profile, password, and account details.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="panel-xl p-2 h-fit flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2.5 shrink-0 px-4 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap',
                tab === t.id
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
          <Link
            href="/notifications"
            className="flex items-center gap-2.5 shrink-0 px-4 py-3 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all whitespace-nowrap lg:mt-1"
          >
            <Bell className="h-4 w-4" />
            Alerts
          </Link>
        </nav>

        <div className="panel-xl p-6 sm:p-8 min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-bold text-muted-foreground">Loading settings…</p>
            </div>
          ) : tab === 'profile' ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-foreground">Your profile</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Update your name and contact number. Email and role cannot be changed here.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-4 pb-2 border-b border-border">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl font-black text-primary shrink-0">
                  {profile?.avatarUrl ? (
                    <img
                      src={resolveMediaUrl(profile.avatarUrl)}
                      alt=""
                      className="h-full w-full rounded-2xl object-cover"
                    />
                  ) : (
                    <>
                      {(profile?.firstName?.[0] || user?.firstName?.[0] || '?')}
                      {profile?.lastName?.[0] || user?.lastName?.[0] || ''}
                    </>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-black text-foreground text-lg">
                    {profile?.firstName} {profile?.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {profile?.email}
                  </p>
                  <span className="inline-flex mt-2 items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[10px] font-black uppercase tracking-wider">
                    <Shield className="h-3 w-3" />
                    {formatRole(profile?.role || user?.role)}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    First name
                  </label>
                  <input
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, firstName: e.target.value }))}
                    className={inputClass}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Last name
                  </label>
                  <input
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm((f) => ({ ...f, lastName: e.target.value }))}
                    className={inputClass}
                    autoComplete="family-name"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Mobile number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                      className={cn(inputClass, 'pl-10')}
                      placeholder="9876543210"
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Email
                  </label>
                  <input value={profile?.email || ''} readOnly className={cn(inputClass, 'opacity-70')} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Role
                  </label>
                  <input
                    value={formatRole(profile?.role || user?.role)}
                    readOnly
                    className={cn(inputClass, 'opacity-70')}
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={updateProfileMutation.isPending}
                onClick={() => updateProfileMutation.mutate()}
                className="px-6 py-3 rounded-xl text-sm font-black bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {updateProfileMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </button>
            </div>
          ) : tab === 'password' ? (
            <div className="space-y-6 max-w-lg">
              <div>
                <h3 className="text-lg font-black text-foreground">Change password</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  After saving, you will be signed out on all devices and must log in again.
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
                    }
                    className={inputClass}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    New password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
                    }
                    className={inputClass}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={changePasswordMutation.isPending}
                onClick={() => changePasswordMutation.mutate()}
                className="px-6 py-3 rounded-xl text-sm font-black bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-foreground">Account details</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Information linked to your login and organization.
                </p>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    User ID
                  </dt>
                  <dd className="mt-1 text-xs font-mono font-bold text-foreground break-all">
                    {profile?.id}
                  </dd>
                </div>
                <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Status
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-foreground">
                    {profile?.isActive ? 'Active' : 'Inactive'}
                  </dd>
                </div>
                {profile?.school && (
                  <>
                    <div className="p-4 rounded-2xl bg-muted/40 border border-border sm:col-span-2">
                      <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        School
                      </dt>
                      <dd className="mt-1 text-sm font-black text-foreground">
                        {profile.school.name}{' '}
                        <span className="text-muted-foreground font-mono text-xs">
                          ({profile.school.code})
                        </span>
                      </dd>
                    </div>
                  </>
                )}
                {profile?.role === 'TEACHER' && (
                  <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                    <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      Class assignments
                    </dt>
                    <dd className="mt-1 text-sm font-bold text-foreground">
                      {profile._count?.teacherAssignments ?? 0} assigned
                    </dd>
                  </div>
                )}
                <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                  <dt className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Member since
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-foreground">
                    {profile?.createdAt
                      ? new Date(profile.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '—'}
                  </dd>
                </div>
              </dl>

              {profile?.role === 'SUPER_ADMIN' && (
                <p className="text-xs text-muted-foreground font-medium max-w-xl">
                  As Super Admin you can manage schools, templates, printing, and system-wide reports from
                  the sidebar.
                </p>
              )}
              {profile?.role === 'SCHOOL_ADMIN' && (
                <p className="text-xs text-muted-foreground font-medium max-w-xl">
                  As School Admin you manage teachers, classes, students, and ID card generation for your
                  school.
                </p>
              )}
              {profile?.role === 'TEACHER' && (
                <p className="text-xs text-muted-foreground font-medium max-w-xl">
                  As Teacher you can view students in your assigned classes and preview ID cards.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
