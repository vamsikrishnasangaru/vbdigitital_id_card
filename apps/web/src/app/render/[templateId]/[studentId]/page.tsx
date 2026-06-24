import { RenderStudentCardShell } from './render-student-card';

type PageProps = {
  params: Promise<{ templateId: string; studentId: string }>;
};

export default async function RenderPage({ params }: PageProps) {
  const { templateId, studentId } = await params;
  return <RenderStudentCardShell templateId={templateId} studentId={studentId} />;
}
