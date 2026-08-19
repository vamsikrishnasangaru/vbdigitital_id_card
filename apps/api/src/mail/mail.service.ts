import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import {
  buildContactInquiryAdminEmail,
  buildContactThankYouEmail,
  type ContactInquiryPayload,
} from './contact-email.templates';

export type ContactInquiryEmail = ContactInquiryPayload;

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

  private fromAddress(): string {
    return (
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim() ||
      this.notifyEmail()
    );
  }

  async sendContactInquiry(data: ContactInquiryEmail): Promise<boolean> {
    if (!this.transporter) return false;

    const { subject, text, html } = buildContactInquiryAdminEmail(data);

    try {
      await this.transporter.sendMail({
        from: `"VB Digital ID Cards" <${this.fromAddress()}>`,
        to: this.notifyEmail(),
        replyTo: data.email?.trim() || undefined,
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to send contact inquiry email', err instanceof Error ? err.stack : err);
      return false;
    }
  }

  async sendContactThankYou(data: ContactInquiryEmail): Promise<boolean> {
    const to = data.email?.trim();
    if (!this.transporter || !to) return false;

    const { subject, text, html } = buildContactThankYouEmail(data);

    try {
      await this.transporter.sendMail({
        from: `"VB Digital ID Cards" <${this.fromAddress()}>`,
        to,
        replyTo: this.notifyEmail(),
        subject,
        text,
        html,
      });
      return true;
    } catch (err) {
      this.logger.error('Failed to send contact thank-you email', err instanceof Error ? err.stack : err);
      return false;
    }
  }
}
