import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  async submit(dto: CreateContactDto) {
    const schoolName = dto.schoolName.trim();
    const mobile = dto.mobile.trim();
    const email = dto.email?.trim() || null;
    const message = dto.message?.trim() || null;

    const inquiry = await this.prisma.contactInquiry.create({
      data: { schoolName, mobile, email, message },
    });

    const emailSent = await this.mail.sendContactInquiry({
      schoolName,
      mobile,
      email,
      message,
      inquiryId: inquiry.id,
    });
    if (!emailSent) {
      this.logger.warn(`Contact inquiry ${inquiry.id} saved but admin email was not sent (check SMTP env).`);
    }

    const thankYouSent = email
      ? await this.mail.sendContactThankYou({
          schoolName,
          mobile,
          email,
          message,
          inquiryId: inquiry.id,
        })
      : false;
    if (email && !thankYouSent) {
      this.logger.warn(`Contact inquiry ${inquiry.id} saved but thank-you email was not sent to ${email}.`);
    }

    const admins = await this.prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true },
      select: { id: true },
    });

    if (admins.length > 0) {
      const summary = message ? `${message.slice(0, 120)}${message.length > 120 ? '…' : ''}` : 'No message';
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'SYSTEM',
          title: 'New school contact',
          message: `${schoolName} · ${mobile}${email ? ` · ${email}` : ''}. ${summary}`,
          metadata: { contactInquiryId: inquiry.id },
        })),
      });
    }

    return { ok: true, id: inquiry.id, emailSent, thankYouSent };
  }
}
