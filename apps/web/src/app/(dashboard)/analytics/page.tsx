'use client';

import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  BarChart3,
  School,
  Users,
  BookOpen,
  CreditCard,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-reports', user?.role, user?.schoolId],
    queryFn: async () => {
      if (isSuperAdmin) {
        const { data: res } = await api.get('/analytics/dashboard');
        return res;
      }
      if (user?.schoolId) {
        const { data: res } = await api.get(`/analytics/school/${user.schoolId}`);
        return res;
      }
      return null;
    },
    enabled: !!user && (isSuperAdmin || !!user.schoolId),
  });

  if (user?.role === 'TEACHER') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Use your dashboard for class and student summaries.
          </p>
        </div>
        <div className="panel-xl p-8 text-center">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground font-medium">
            Detailed reports for teachers are on the{' '}
            <Link href="/dashboard" className="text-primary font-bold hover:underline">
              Dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const stats = isSuperAdmin
    ? [
        { key: 'totalSchools', label: 'Schools', icon: School, color: 'indigo' as const, href: '/schools' },
        { key: 'totalStudents', label: 'Students', icon: Users, color: 'blue' as const, href: '/students' },
        {
          key: 'incompleteStudents',
          label: 'Incomplete',
          icon: AlertCircle,
          color: 'rose' as const,
          href: '/students?filter=incomplete',
        },
        {
          key: 'submittedStudents',
          label: 'Pending Review',
          icon: Clock,
          color: 'amber' as const,
          href: '/students?filter=pending',
          sublabel: 'View only',
        },
        {
          key: 'completeStudents',
          label: 'Verified',
          icon: CheckCircle2,
          color: 'emerald' as const,
          href: '/students?filter=verified',
        },
        { key: 'totalIdCards', label: 'Cards Generated', icon: CreditCard, color: 'violet' as const, href: '/id-cards' },
      ]
    : [
        { key: 'totalStudents', label: 'Students', icon: Users, color: 'blue' as const, href: '/students' },
        {
          key: 'incompleteStudents',
          label: 'Incomplete',
          icon: AlertCircle,
          color: 'rose' as const,
          href: '/students?filter=incomplete',
        },
        {
          key: 'submittedStudents',
          label: 'Pending Review',
          icon: Clock,
          color: 'amber' as const,
          href: '/students?filter=pending',
        },
        {
          key: 'completeStudents',
          label: 'Verified',
          icon: CheckCircle2,
          color: 'emerald' as const,
          href: '/students?filter=verified',
        },
        { key: 'totalClasses', label: 'Classes', icon: BookOpen, color: 'indigo' as const, href: '/classes' },
      ];

  const classWise = (data?.classWise ?? []) as {
    id: string;
    name: string;
    _count?: { students: number };
  }[];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-[0.2em] mb-1">
          <BarChart3 className="h-3.5 w-3.5" /> Reports
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
          {isSuperAdmin ? 'Platform Reports' : 'School Reports'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Key counts from live data — no placeholder charts.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.key}
            href={stat.href}
            label={stat.label}
            value={typeof data?.[stat.key] === 'number' ? data[stat.key] : 0}
            icon={stat.icon}
            color={stat.color}
            loading={isLoading}
            sublabel={'sublabel' in stat ? stat.sublabel : undefined}
          />
        ))}
      </div>

      {!isSuperAdmin && classWise.length > 0 && (
        <div className="panel-xl overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-black">Enrollment by Class</h3>
            <Link href="/classes" className="text-xs font-black text-primary hover:underline">
              View classes
            </Link>
          </div>
          <div className="divide-y divide-border">
            {classWise.map((cls) => (
              <div key={cls.id} className="flex items-center justify-between p-4 sm:px-6">
                <span className="text-sm font-bold text-foreground">{cls.name}</span>
                <span className="text-sm font-black text-muted-foreground">
                  {cls._count?.students ?? 0} students
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSuperAdmin && (data?.recentSchools?.length ?? 0) > 0 && (
        <div className="panel-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h3 className="text-lg font-black">Schools Overview</h3>
          </div>
          <div className="divide-y divide-border">
            {(data.recentSchools as { id: string; name: string; _count?: { students: number } }[]).map(
              (school) => (
                <Link
                  key={school.id}
                  href="/schools"
                  className="flex items-center justify-between p-4 sm:px-6 hover:bg-muted/30 transition-colors group"
                >
                  <span className="text-sm font-bold text-foreground">{school.name}</span>
                  <div className="flex items-center gap-2 text-sm font-black text-muted-foreground">
                    {school._count?.students ?? 0} students
                    <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
