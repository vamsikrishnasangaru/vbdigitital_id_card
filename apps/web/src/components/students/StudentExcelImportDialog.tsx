'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2, Upload, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  IMPORT_TEMPLATE_HEADERS,
  IMPORT_TEMPLATE_SAMPLE,
  parseExcelRows,
  toImportPayload,
  type ParsedImportRow,
} from '@/lib/student-excel-import';

interface StudentExcelImportDialogProps {
  open: boolean;
  onClose: () => void;
  schoolId: string;
  schoolName?: string;
}

export function StudentExcelImportDialog({
  open,
  onClose,
  schoolId,
  schoolName,
}: StudentExcelImportDialogProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState('');

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['classes', schoolId, 'import-full'],
    queryFn: async () => {
      const { data } = await api.get(`/classes/school/${schoolId}`);
      return data as { id: string; name: string; sections?: { id: string; name: string }[] }[];
    },
    enabled: open && !!schoolId,
  });

  const importMutation = useMutation({
    mutationFn: async (students: ReturnType<typeof toImportPayload>) => {
      const { data } = await api.post<{
        created: number;
        updated?: number;
        failed: number;
        classesCreated?: number;
        sectionsCreated?: number;
        results?: { index: number; success: boolean; message?: string; updated?: boolean }[];
      }>('/students/bulk-import', {
        schoolId,
        students,
      });
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['classes', schoolId] });

      if (data.failed > 0 && data.results?.length) {
        setParsedRows((prev) =>
          prev.map((row, idx) => {
            const result = data.results!.find((r) => r.index === idx);
            if (!result || result.success) return row;
            return { ...row, status: 'error' as const, message: result.message || 'Import failed' };
          }),
        );
        const reasons = data.results
          .filter((r) => !r.success)
          .map((r) => r.message)
          .filter(Boolean)
          .slice(0, 3)
          .join(' · ');
        toast.error(
          reasons || `${data.failed} row(s) failed — see errors in the table`,
        );
        return;
      }

      const summary: string[] = [];
      if (data.created) summary.push(`${data.created} added`);
      if (data.updated) summary.push(`${data.updated} updated`);
      const extras: string[] = [];
      if (data.classesCreated) extras.push(`${data.classesCreated} class(es) created`);
      if (data.sectionsCreated) extras.push(`${data.sectionsCreated} section(s) created`);
      toast.success(
        `${summary.join(', ') || 'Import complete'}${extras.length ? ` · ${extras.join(', ')}` : ''}`,
      );
      handleClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Import failed');
    },
  });

  const readyRows = parsedRows.filter((r) => r.status === 'ready');
  const errorRows = parsedRows.filter((r) => r.status === 'error');

  const handleClose = () => {
    setParsedRows([]);
    setFileName('');
    onClose();
  };

  const downloadTemplate = () => {
    void import('xlsx').then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(IMPORT_TEMPLATE_SAMPLE, { header: IMPORT_TEMPLATE_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Students');
      XLSX.writeFile(wb, 'student_import_template.xlsx');
    });
  };

  const handleFile = async (file: File) => {
    if (!schoolId) {
      toast.error('Select a school first');
      return;
    }
    if (loadingClasses) {
      toast.error('Loading classes — try again in a moment');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        toast.error('The file has no sheets');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (json.length === 0) {
        toast.error('No data rows found (use row 1 for headers)');
        return;
      }
      const rows = parseExcelRows(json, classes);
      setParsedRows(rows);
      setFileName(file.name);
      const ready = rows.filter((r) => r.status === 'ready').length;
      const errors = rows.length - ready;
      if (ready === 0) {
        toast.error('No valid rows — check required columns and values');
      } else if (errors > 0) {
        toast.warning(`${ready} ready, ${errors} row(s) need fixes`);
      } else {
        toast.success(`${ready} student(s) ready to import`);
      }
    } catch {
      toast.error('Could not read Excel file');
    }
  };

  const runImport = () => {
    const payload = toImportPayload(parsedRows);
    if (payload.length === 0) {
      toast.error('No valid rows to import');
      return;
    }
    importMutation.mutate(payload);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-start gap-4">
          <div>
            <h3 className="text-xl font-black text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Import from Excel
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {schoolName
                ? `Students are added to ${schoolName}. Missing classes and sections are created automatically.`
                : 'Upload a sheet with student name, class, section, father name, and address.'}
            </p>
          </div>
          <button type="button" onClick={handleClose} className="p-2 rounded-xl hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-xs font-bold hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download template
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loadingClasses}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Choose Excel file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Required columns: <strong className="text-foreground">Student Name</strong>,{' '}
            <strong className="text-foreground">Roll Number</strong>,{' '}
            <strong className="text-foreground">Class</strong>,{' '}
            <strong className="text-foreground">Section</strong>,{' '}
            <strong className="text-foreground">Father Name</strong>,{' '}
            <strong className="text-foreground">Address</strong>. Optional: Parent Phone.
            Existing classes are matched automatically (e.g. &quot;10&quot; matches &quot;Class 10&quot;).
            New classes and sections are created when needed.
          </p>

          {fileName && (
            <p className="text-xs font-bold text-foreground">
              File: {fileName}
              {parsedRows.length > 0 && (
                <span className="text-muted-foreground font-medium ml-2">
                  · {readyRows.length} ready · {errorRows.length} errors
                </span>
              )}
            </p>
          )}

          {parsedRows.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Row</th>
                    <th className="text-left px-3 py-2 font-bold">Student</th>
                    <th className="text-left px-3 py-2 font-bold">Roll No.</th>
                    <th className="text-left px-3 py-2 font-bold">Class</th>
                    <th className="text-left px-3 py-2 font-bold">Section</th>
                    <th className="text-left px-3 py-2 font-bold">Father Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {parsedRows.slice(0, 100).map((row) => (
                    <tr key={row.rowNumber} className={row.status === 'error' ? 'bg-red-500/5' : ''}>
                      <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{row.studentName}</td>
                      <td className="px-3 py-2 font-mono font-bold">{row.rollNumber || '—'}</td>
                      <td className="px-3 py-2">{row.className}</td>
                      <td className="px-3 py-2">{row.sectionName}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-foreground">{row.parentName}</span>
                          {row.status === 'error' && row.message ? (
                            <span className="text-[10px] text-red-600" title={row.message}>
                              {row.message}
                            </span>
                          ) : row.message ? (
                            <span className="text-[10px] text-amber-600" title={row.message}>
                              {row.message}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 100 && (
                <p className="text-center text-[10px] text-muted-foreground py-2">
                  Showing first 100 rows
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={readyRows.length === 0 || importMutation.isPending}
            onClick={runImport}
            className={cn(
              'px-6 py-2.5 rounded-xl text-sm font-black bg-primary text-primary-foreground',
              'disabled:opacity-50 flex items-center gap-2',
            )}
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>Import {readyRows.length} student{readyRows.length === 1 ? '' : 's'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
