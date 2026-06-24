'use client';

import { useNextPageParams, type NextClientPageProps } from '@/lib/next-page-params';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import { Eye, EyeOff, CreditCard, Loader2 } from 'lucide-react';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';

export default function LoginPage({ params }: NextClientPageProps) {
  useNextPageParams(params);
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.user, data.accessToken, data.refreshToken);
      toast.success('Welcome back!', { description: `Signed in as ${data.user.firstName}` });
      router.push('/dashboard');
    } catch (err: any) {
      toast.error('Login failed', { description: err.response?.data?.message || 'Invalid credentials' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[oklch(0.35_0.18_270)] via-[oklch(0.45_0.20_280)] to-[oklch(0.40_0.22_300)] items-center justify-center p-12">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="relative z-10 text-white max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <CreditCard className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">VB Digital</h1>
              <p className="text-white/80 text-sm font-medium">ID Cards</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Smart School ID Card Management
          </h2>
          <p className="text-white/70 text-lg leading-relaxed">
            Complete platform for managing student onboarding, ID card design, printing workflow, and delivery tracking — all in one place.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { label: 'Schools Managed', value: '500+' },
              { label: 'Cards Generated', value: '1M+' },
              { label: 'Uptime', value: '99.9%' },
              { label: 'Support', value: '24/7' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="text-white/60 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="p-2 bg-primary/10 rounded-lg">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold">VB Digital ID Cards</span>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground mt-1 mb-6">Sign in to your account to continue</p>

          <PwaInstallBanner />

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email Address</label>
              <input
                id="email"
                type="email"
                placeholder="admin@vbdigital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <button type="button" className="text-xs text-primary hover:underline">Forgot password?</button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-8">
            © {new Date().getFullYear()} VB Digital ID Cards. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
