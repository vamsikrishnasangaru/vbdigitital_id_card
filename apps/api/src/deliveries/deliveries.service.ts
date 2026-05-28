import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async create(data: { schoolId: string; orderId?: string; totalCards: number; trackingNumber?: string; courierName?: string; notes?: string }) {
    return this.prisma.delivery.create({
      data: { ...data, packedAt: new Date() },
      include: { school: true, order: true },
    });
  }

  async findAll(query: { schoolId?: string; status?: string; page?: number; limit?: number }) {
    const { schoolId, status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.delivery.findMany({
        where,
        include: { school: { select: { id: true, name: true } }, order: { select: { id: true, orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.delivery.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateStatus(id: string, status: string, acknowledgedBy?: string) {
    const update: any = { status };
    if (status === 'DISPATCHED') update.dispatchedAt = new Date();
    if (status === 'DELIVERED') { update.deliveredAt = new Date(); }
    if (acknowledgedBy) { update.acknowledgedAt = new Date(); update.acknowledgedBy = acknowledgedBy; }
    return this.prisma.delivery.update({ where: { id }, data: update });
  }

  async findOne(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { school: true, order: { include: { idCards: { include: { student: true } } } } },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }
}
