import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Teachers')
@Controller('teachers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  @Post()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Create a new teacher' })
  create(@Request() req: any, @Body() dto: CreateTeacherDto) {
    const schoolId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return this.teachersService.create(dto, schoolId);
  }

  @Get('me/assignments')
  @Roles('TEACHER')
  @ApiOperation({ summary: 'Get current teacher class/section assignments' })
  getMyAssignments(@Request() req: any) {
    return this.teachersService.getMyAssignments(req.user.sub);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'List all teachers' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'schoolId', required: false })
  @ApiQuery({ name: 'isActive', required: false, description: 'true or false' })
  findAll(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('schoolId') schoolIdQuery?: string,
    @Query('isActive') isActive?: string,
  ) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? schoolIdQuery || undefined : req.user.schoolId;
    const isActiveFilter =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.teachersService.findAll(schoolId, {
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      isActive: isActiveFilter,
    });
  }

  @Put(':id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Update teacher' })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    const schoolId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return this.teachersService.update(id, dto, schoolId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Soft delete teacher' })
  remove(@Request() req: any, @Param('id') id: string) {
    const schoolId = req.user.role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return this.teachersService.remove(id, schoolId);
  }
}
