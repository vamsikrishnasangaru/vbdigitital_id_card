'use client';

import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import {
  School, Users, CreditCard, Printer, Package, ShoppingCart,
  TrendingUp, Clock, ArrowUpRight, GraduationCap, CheckCircle2,
  AlertCircle, LayoutDashboard, Upload, Sparkles, Zap, ShieldCheck,
  BookOpen, UserPlus, Settings
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { StatCard, type StatCardColor } from '@/components/ui/stat-card';

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['dashboard', user?.role, user?.schoolId],
    queryFn: async () => {
      if (user?.role === 'SUPER_ADMIN') {
        const res = await api.get('/analytics/dashboard');
        return res.data;
      } else if (user?.role === 'SCHOOL_ADMIN' && user?.schoolId) {
        const res = await api.get(`/analytics/school/${user.schoolId}`);
        return res.data;
      } else if (user?.role === 'TEACHER') {
        const res = await api.get('/analytics/teacher');
        return res.data;
      }
      return null;
    },
    enabled: !!user,
  });

  const getStatCards = () => {
    if (user?.role === 'SUPER_ADMIN') {
      return [
        { key: 'totalSchools', label: 'Total Schools', icon: School, color: 'indigo' as StatCardColor, href: '/schools' },
        { key: 'totalStudents', label: 'Total Students', icon: Users, color: 'blue' as StatCardColor, href: '/students' },
        { key: 'totalOrders', label: 'Total Orders', icon: ShoppingCart, color: 'emerald' as StatCardColor, href: '/orders' },
        { key: 'pendingOrders', label: 'Pending Approvals', icon: Clock, color: 'amber' as StatCardColor, href: '/orders' },
        { key: 'printingBatches', label: 'Print Queue', icon: Printer, color: 'rose' as StatCardColor, href: '/print' },
        { key: 'activeDeliveries', label: 'Active Deliveries', icon: Package, color: 'violet' as StatCardColor, href: '/deliveries' },
      ];
    }
    
    return [
      { key: 'totalStudents', label: 'Total Enrollment', icon: Users, color: 'blue' as StatCardColor, href: '/students' },
      { key: 'submittedStudents', label: 'Pending Review', icon: Clock, color: 'amber' as StatCardColor, href: '/students?status=SUBMITTED' },
      { key: 'approvedStudents', label: 'Verified Students', icon: CheckCircle2, color: 'emerald' as StatCardColor, href: '/students?status=APPROVED' },
      { key: 'draftStudents', label: 'Draft Students', icon: AlertCircle, color: 'rose' as StatCardColor, href: '/students?status=DRAFT' },
    ];
  };

  const statCards = getStatCards();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Simple Welcome Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Welcome back, {user?.firstName} 👋
          </h1>
        </div>
        <p className="text-muted-foreground font-medium">
          Here is what is happening today.
        </p>
      </div>

      {/* Horizontal Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => {
          const value = data ? (data as any)[stat.key] ?? 0 : '0';
          return (
            <StatCard
              key={stat.key}
              href={stat.href}
              label={stat.label}
              value={value}
              icon={stat.icon}
              color={stat.color}
              loading={loading}
            />
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Recent Activity */}
        <div className="lg:col-span-8 space-y-6">
          <div className="panel-xl overflow-hidden">
            <div className="p-8 flex items-center justify-between border-b border-border">
              <h3 className="text-lg font-black text-foreground">Recent Activity</h3>
              <Link href={user?.role === 'SUPER_ADMIN' ? '/schools' : '/students'} className="text-xs font-black text-primary hover:underline">
                View All
              </Link>
            </div>
            
            <div className="p-4">
              {user?.role === 'SUPER_ADMIN' ? (
                <div className="space-y-1">
                  {loading ? (
                    <div className="space-y-2 p-4">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-2xl" />)}</div>
                  ) : data?.recentSchools?.length > 0 ? (
                    data.recentSchools.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between p-4 rounded-2xl hover:bg-muted/50 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <School className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-black text-foreground">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground font-bold uppercase">{s._count?.students || 0} Students</div>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-muted-foreground font-medium italic">No recent activity yet.</div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground font-medium italic">No recent activity yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Quick Actions */}
        <div className="lg:col-span-4 space-y-6">
          <div className="panel-xl overflow-hidden">
            <div className="p-8 border-b border-border">
              <h3 className="text-lg font-black text-foreground">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-1">
              {[
                { label: 'Add New School', href: '/schools', icon: School, roles: ['SUPER_ADMIN'] },
                { label: 'Add Student', href: '/students', icon: UserPlus, roles: ['SCHOOL_ADMIN', 'TEACHER'] },
                { label: 'Generate Cards', href: '/id-cards', icon: CreditCard, roles: ['SCHOOL_ADMIN'] },
                { label: 'Printing', href: '/print', icon: Printer, roles: ['SUPER_ADMIN'] },
                { label: 'Settings', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] },
              ].filter(a => a.roles.includes(user?.role as string)).map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-primary/5 transition-all group"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted border border-border flex items-center justify-center group-hover:border-primary/50 transition-all">
                    <action.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                  </div>
                  <span className="flex-1 text-sm font-black text-foreground">{action.label}</span>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
