import { BadRequestException, Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto, RefreshTokenDto, ChangePasswordDto, UpdateProfileDto } from './dto/auth.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: 'SUPER_ADMIN',
      },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { school: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Audit log
    await this.prisma.auditLog.create({
      data: { userId: user.id, schoolId: user.schoolId, action: 'LOGIN', resource: 'auth' },
    });

    return this.generateTokens(user);
  }

  async refreshToken(dto: RefreshTokenDto) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken: dto.refreshToken },
      include: { user: { include: { school: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.deleteMany({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate refresh token (deleteMany avoids P2025 when parallel refresh calls race)
    const { count } = await this.prisma.session.deleteMany({ where: { id: session.id } });
    if (count === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return this.generateTokens(session.user);
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshToken } });
    return { message: 'Logged out successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    // Invalidate all sessions
    await this.prisma.session.deleteMany({ where: { userId } });
    return { message: 'Password changed successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatarUrl: true, role: true, isActive: true,
        schoolId: true, school: { select: { id: true, name: true, code: true, logoUrl: true } },
        createdAt: true,
        _count: { select: { teacherAssignments: true } },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const data: { firstName?: string; lastName?: string; phone?: string | null } = {};
    if (dto.firstName !== undefined) {
      const firstName = dto.firstName.trim();
      if (!firstName) throw new BadRequestException('First name is required');
      data.firstName = firstName;
    }
    if (dto.lastName !== undefined) {
      const lastName = dto.lastName.trim();
      if (!lastName) throw new BadRequestException('Last name is required');
      data.lastName = lastName;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() ? dto.phone.trim() : null;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        phone: true, avatarUrl: true, role: true, isActive: true,
        schoolId: true, school: { select: { id: true, name: true, code: true, logoUrl: true } },
        createdAt: true,
        _count: { select: { teacherAssignments: true } },
      },
    });

    return updated;
  }

  /** Short-lived token for headless PDF render (Puppeteer). */
  createRenderToken(): string {
    return this.jwtService.sign(
      {
        sub: 'render-service',
        email: 'render@internal',
        role: 'SUPER_ADMIN',
        schoolId: null,
        purpose: 'render',
      },
      { expiresIn: '10m' },
    );
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = uuidv4();

    // Store refresh token
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        schoolId: user.schoolId,
        school: user.school || null,
      },
    };
  }
}
