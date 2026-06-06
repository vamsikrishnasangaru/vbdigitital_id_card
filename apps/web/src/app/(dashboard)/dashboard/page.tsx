'use client';

import { useAuthStore } from '@/stores/auth-store';
import api from '@/lib/api';
import {
  School,
  Users,
  CreditCard,
  ArrowUpRight,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserPlus,
  Settings,
  BookOpen,
  Palette,
} from 'lucide-react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { StatCard, type StatCardColor } from '@/components/ui/stat-card';
import { formatClassSectionLabel, formatStudentFullName, formatSectionName } from '@/lib/utils';

type RecentStudent = {
  id: string;
  firstName: string;
  lastName: string;
  rollNumber?: string | null;
  status: string;
  createdAt: string;
  class?: { name: string };
  section?: { name: string };
  school?: { id: string; name: string };
};

type ClassSummary = {
  id: string;
  name: string;
  _count?: { students: number };
};

type AssignmentStat = {
  className: string;
  sectionName: string;
  total: number;
  complete: number;
  percentage: number;
};

type DashboardData = {
  recentStudents?: RecentStudent[];
  recentSchools?: { id: string; name: string; _count?: { students: number } }[];
  classWise?: ClassSummary[];
  assignments?: AssignmentStat[];
  [key: string]: unknown;
};

type StatDef = {
  key: string;
  label: string;
  icon: typeof Users;
  color: StatCardColor;
  href: string;
  sublabel?: string;
};

function formatStudentActivityMeta(student: RecentStudent, showSchool: boolean) {
  const parts: string[] = [];
  if (showSchool && student.school?.name) parts.push(student.school.name);
  const classSection = formatClassSectionLabel(student.class?.name, student.section?.name);
  if (classSection) parts.push(classSection);
  if (student.rollNumber) parts.push(`Roll ${student.rollNumber}`);
  parts.push(student.status.replace(/_/g, ' '));
  return parts.join(' · ');
}

function statValue(data: DashboardData | null | undefined, key: string, loading: boolean) {
  if (loading) return 0;
  const raw = data?.[key];
  return typeof raw === 'number' ? raw : Number(raw) || 0;
}

function superAdminStats(): StatDef[] {
  return [
    { key: 'totalSchools', label: 'Schools', icon: School, color: 'indigo', href: '/schools' },
    { key: 'totalStudents', label: 'Students', icon: Users, color: 'blue', href: '/students' },
    {
      key: 'incompleteStudents',
      label: 'Incomplete',
      icon: AlertCircle,
      color: 'rose',
      href: '/students?filter=incomplete&allSchools=1',
      sublabel: 'All schools',
    },
    {
      key: 'submittedStudents',
      label: 'Pending Review',
      icon: Clock,
      color: 'amber',
      href: '/students?filter=pending&allSchools=1',
      sublabel: 'View only',
    },
    {
      key: 'completeStudents',
      label: 'Verified',
      icon: CheckCircle2,
      color: 'emerald',
      href: '/students?filter=verified&allSchools=1',
    },
    { key: 'totalIdCards', label: 'Cards Generated', icon: CreditCard, color: 'violet', href: '/id-cards' },
  ];
}

function schoolAdminStats(): StatDef[] {
  return [
    { key: 'totalStudents', label: 'Total Students', icon: Users, color: 'blue', href: '/students' },
    {
      key: 'incompleteStudents',
      label: 'Incomplete',
      icon: AlertCircle,
      color: 'rose',
      href: '/students?filter=incomplete',
    },
    {
      key: 'submittedStudents',
      label: 'Pending Review',
      icon: Clock,
      color: 'amber',
      href: '/students?filter=pending',
    },
    {
      key: 'completeStudents',
      label: 'Verified',
      icon: CheckCircle2,
      color: 'emerald',
      href: '/students?filter=verified',
    },
    { key: 'totalClasses', label: 'Classes', icon: BookOpen, color: 'indigo', href: '/classes' },
  ];
}

function teacherStats(): StatDef[] {
  return [
    { key: 'totalStudents', label: 'My Students', icon: Users, color: 'blue', href: '/students' },
    {
      key: 'incompleteStudents',
      label: 'Incomplete',
      icon: AlertCircle,
      color: 'rose',
      href: '/students?filter=incomplete',
    },
    {
      key: 'submittedStudents',
      label: 'Pending Review',
      icon: Clock,
      color: 'amber',
      href: '/students?filter=pending',
    },
    {
      key: 'completeStudents',
      label: 'Verified',
      icon: CheckCircle2,
      color: 'emerald',
      href: '/students?filter=verified',
    },
  ];
}

function getStatCards(role?: string): StatDef[] {
  if (role === 'SUPER_ADMIN') return superAdminStats();
  if (role === 'TEACHER') return teacherStats();
  return schoolAdminStats();
}

type QuickAction = {
  label: string;
  href: string;
  icon: typeof Users;
  roles: string[];
};

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Add School', href: '/schools', icon: School, roles: ['SUPER_ADMIN'] },
  { label: 'Manage Students', href: '/students', icon: Users, roles: ['SUPER_ADMIN'] },
  { label: 'Templates', href: '/templates', icon: Palette, roles: ['SUPER_ADMIN'] },
  { label: 'Classes', href: '/classes', icon: BookOpen, roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] },
  { label: 'Add Student', href: '/students', icon: UserPlus, roles: ['SCHOOL_ADMIN', 'TEACHER'] },
  { label: 'Generate Cards', href: '/id-cards', icon: CreditCard, roles: ['SCHOOL_ADMIN'] },
  { label: 'Preview Cards', href: '/id-cards', icon: CreditCard, roles: ['TEACHER'] },
  { label: 'Teachers', href: '/teachers', icon: GraduationCap, roles: ['SCHOOL_ADMIN'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'] },
];

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['dashboard', user?.role, user?.schoolId],
    queryFn: async () => {
      if (user?.role === 'SUPER_ADMIN') {
        const res = await api.get('/analytics/dashboard');
        return res.data as DashboardData;
      }
      if (user?.role === 'SCHOOL_ADMIN' && user?.schoolId) {
        const res = await api.get(`/analytics/school/${user.schoolId}`);
        return res.data as DashboardData;
      }
      if (user?.role === 'TEACHER') {
        const res = await api.get('/analytics/teacher');
        return res.data as DashboardData;
      }
      return null;
    },
    enabled: !!user,
  });

  const statCards = getStatCards(user?.role);
  const dashboard = data ?? undefined;
  const recentStudents = dashboard?.recentStudents ?? [];
  const recentSchools = dashboard?.recentSchools ?? [];
  const classWise = dashboard?.classWise ?? [];
  const assignments = dashboard?.assignments ?? [];
  const showSchoolInActivity = user?.role === 'SUPER_ADMIN';
  const quickActions = QUICK_ACTIONS.filter((a) => user && a.roles.includes(user.role));

  const gridCols =
    statCards.length >= 6
      ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
      : statCards.length === 5
        ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5'
        : 'grid-cols-2 md:grid-cols-4';

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black tracking-tight text-foreground">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="text-muted-foreground font-medium">
          {user?.role === 'TEACHER'
            ? 'Overview of your assigned classes and students.'
            : user?.role === 'SUPER_ADMIN'
              ? 'Platform overview across all schools.'
              : 'Your school at a glance.'}
        </p>
      </div>

      <div className={`grid ${gridCols} gap-4`}>
        {statCards.map((stat) => (
          <StatCard
            key={stat.key}
            href={stat.href}
            label={stat.label}
            value={statValue(dashboard, stat.key, loading)}
            icon={stat.icon}
            color={stat.color}
            loading={loading}
            sublabel={stat.sublabel}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="panel-xl overflow-hidden">
            <div className="p-6 sm:p-8 flex items-center justify-between border-b border-border">
              <h3 className="text-lg font-black text-foreground">Recent Students</h3>
              <Link href="/students" className="text-xs font-black text-primary hover:underline">
                View all
              </Link>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : recentStudents.length > 0 ? (
                <div className="space-y-1">
                  {recentStudents.map((student) => (
                    <Link
                      key={student.id}
                      href="/students"
                      className="flex items-center justify-between p-4 rounded-2xl hover:bg-muted/50 transition-all group"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black text-foreground truncate">
                            {formatStudentFullName(student.firstName, student.lastName)}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-bold uppercase truncate">
                            {formatStudentActivityMeta(student, showSchoolInActivity)}
                          </div>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : user?.role === 'SUPER_ADMIN' && recentSchools.length > 0 ? (
                <div className="space-y-1">
                  {recentSchools.map((school) => (
                    <Link
                      key={school.id}
                      href="/schools"
                      className="flex items-center justify-between p-4 rounded-2xl hover:bg-muted/50 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <School className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-foreground">{school.name}</div>
                          <div className="text-[10px] text-muted-foreground font-bold uppercase">
                            {school._count?.students ?? 0} students
                          </div>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-muted-foreground font-medium">
                  {user?.role === 'TEACHER' && assignments.length === 0
                    ? 'No class assignments yet. Ask your school admin to assign you to a class.'
                    : 'No students yet. Add your first student to get started.'}
                </div>
              )}
            </div>
          </div>

          {user?.role === 'SCHOOL_ADMIN' && classWise.length > 0 && (
            <div className="panel-xl overflow-hidden">
              <div className="p-6 sm:p-8 flex items-center justify-between border-b border-border">
                <h3 className="text-lg font-black text-foreground">Students by Class</h3>
                <Link href="/classes" className="text-xs font-black text-primary hover:underline">
                  Manage classes
                </Link>
              </div>
              <div className="p-4 grid gap-2 sm:grid-cols-2">
                {classWise.map((cls) => (
                  <Link
                    key={cls.id}
                    href="/classes"
                    className="flex items-center justify-between p-4 rounded-2xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <BookOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <span className="text-sm font-black text-foreground truncate">{cls.name}</span>
                    </div>
                    <span className="text-sm font-black text-muted-foreground shrink-0 ml-3">
                      {cls._count?.students ?? 0}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {user?.role === 'TEACHER' && assignments.length > 0 && (
            <div className="panel-xl overflow-hidden">
              <div className="p-6 sm:p-8 border-b border-border">
                <h3 className="text-lg font-black text-foreground">My Classes</h3>
              </div>
              <div className="p-4 space-y-2">
                {assignments.map((row) => (
                  <Link
                    key={`${row.className}-${row.sectionName}`}
                    href="/students"
                    className="flex items-center justify-between p-4 rounded-2xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-all"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-black text-foreground truncate">
                        {row.className}
                        {formatSectionName(row.sectionName)
                          ? ` · ${formatSectionName(row.sectionName)}`
                          : ''}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-bold uppercase mt-0.5">
                        {row.complete} verified · {row.total} total
                      </div>
                    </div>
                    <div className="text-sm font-black text-primary shrink-0 ml-3">
                      {row.percentage}%
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="panel-xl overflow-hidden">
            <div className="p-6 sm:p-8 border-b border-border">
              <h3 className="text-lg font-black text-foreground">Quick Actions</h3>
            </div>
            <div className="p-4 space-y-1">
              {quickActions.map((action) => (
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

          {user?.role === 'SUPER_ADMIN' && !loading && (
            <div className="panel-xl p-6 sm:p-8 space-y-3">
              <div className="text-sm font-black text-foreground">Platform extras</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link
                  href="/templates"
                  className="p-3 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="font-black text-foreground">{statValue(dashboard, 'totalTemplates', false)}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Templates</div>
                </Link>
                <Link
                  href="/teachers"
                  className="p-3 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="font-black text-foreground">{statValue(dashboard, 'totalTeachers', false)}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Teachers</div>
                </Link>
              </div>
            </div>
          )}

          {user?.role === 'SCHOOL_ADMIN' && !loading && (
            <div className="panel-xl p-6 sm:p-8 space-y-3">
              <div className="text-sm font-black text-foreground">More</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link
                  href="/id-cards"
                  className="p-3 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="font-black text-foreground">{statValue(dashboard, 'totalIdCards', false)}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Cards</div>
                </Link>
                <Link
                  href="/templates"
                  className="p-3 rounded-xl bg-muted/40 border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="font-black text-foreground">{statValue(dashboard, 'totalTemplates', false)}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Templates</div>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
