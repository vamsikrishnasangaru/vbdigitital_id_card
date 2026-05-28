import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { userId?: string; schoolId?: string; type: string; title: string; message: string; actionUrl?: string }) {
    return this.prisma.notification.create({ data: data as any });
  }

  async findAll(userId: string, query: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = query;
    const where = { userId };
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { data, total, unread, page, limit };
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
  }

  async getUnreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, isRead: false } }) };
  }
}
