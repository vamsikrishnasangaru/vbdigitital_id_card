import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type ContactInquiryEmail = {
  schoolName: string;
  mobile: string;
  email?: string | null;
  message?: string | null;
  inquiryId: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();
    if (host && user && pass) {
      const port = Number(this.config.get<string>('SMTP_PORT') || 587);
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — contact form emails will not be sent.');
    }
  }

  private notifyEmail(): string {
    return this.config.get<string>('CONTACT_NOTIFY_EMAIL')?.trim() || 'vbdigitalworld1@gmail.com';
  }

  async sendContactInquiry(data: ContactInquiryEmail): Promise<boolean> {
    if (!this.transporter) return false;

    const to = this.notifyEmail();
    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      to;

    const lines = [
      'New school contact inquiry',
      '',
      `School: ${data.schoolName}`,
      `Mobile: ${data.mobile}`,
      `Email: ${data.email || '—'}`,
      '',
      'Message:',
      data.message?.trim() || '—',
      '',
      `Inquiry ID: ${data.inquiryId}`,
      `Submitted: ${new Date().toISOString()}`,
    ];

    try {
      await this.transporter.sendMail({
        from: `"VB Digital ID Cards" <${from}>`,
        to,
        replyTo: data.email?.trim() || undefined,
        subject: `School contact: ${data.schoolName}`,
        text: lines.join('\n'),
        html: `
          <h2>New school contact inquiry</h2>
          <p><strong>School:</strong> ${escapeHtml(data.schoolName)}</p>
          <p><strong>Mobile:</strong> ${escapeHtml(data.mobile)}</p>
          <p><strong>Email:</strong> ${escapeHtml(data.email || '—')}</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(data.message?.trim() || '—').replace(/\n/g, '<br>')}</p>
          <hr>
          <p style="color:#666;font-size:12px">Inquiry ID: ${escapeHtml(data.inquiryId)}</p>
        `,
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to send contact inquiry email', err instanceof Error ? err.stack : err);
      return false;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
