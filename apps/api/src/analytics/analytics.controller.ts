import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Super Admin dashboard analytics' })
  getSuperAdminDashboard() {
    return this.analyticsService.getSuperAdminDashboard();
  }

  @Get('school/:schoolId')
  @ApiOperation({ summary: 'School dashboard analytics' })
  getSchoolDashboard(@Param('schoolId') schoolId: string) {
    return this.analyticsService.getSchoolDashboard(schoolId);
  }

  @Get('teacher')
  @ApiOperation({ summary: 'Teacher dashboard analytics' })
  getTeacherDashboard(@Request() req: any) {
    return this.analyticsService.getTeacherDashboard(req.user.sub);
  }
}
