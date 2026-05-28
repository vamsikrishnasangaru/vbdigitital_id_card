import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Classes & Sections')
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  private resolveSchoolId(req: any, schoolId: string) {
    const role = req.user.role as string;
    const userSchoolId = req.user.schoolId as string | undefined;
    const target = role === 'SUPER_ADMIN' ? schoolId : userSchoolId;
    if (!target) {
      throw new BadRequestException('School context is required');
    }
    this.classesService.assertSchoolAccess(role, userSchoolId, target);
    return target;
  }

  @Post()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Create a class' })
  createClass(@Request() req: any, @Body() body: { schoolId: string; name: string; sortOrder?: number }) {
    const schoolId = this.resolveSchoolId(req, body.schoolId);
    return this.classesService.createClass(schoolId, body.name, body.sortOrder);
  }

  @Get('school/:schoolId')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get all classes for a school' })
  findAll(@Request() req: any, @Param('schoolId') schoolId: string) {
    const target = this.resolveSchoolId(req, schoolId);
    return this.classesService.findAllClasses(target);
  }

  @Get('teachers/:schoolId')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Get teacher assignments for a school' })
  getTeacherAssignments(@Request() req: any, @Param('schoolId') schoolId: string) {
    const target = this.resolveSchoolId(req, schoolId);
    return this.classesService.getTeacherAssignments(target);
  }

  @Post('assign-teacher')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Assign teacher to class/section' })
  assignTeacher(
    @Request() req: any,
    @Body() body: { userId: string; classId: string; sectionId: string },
  ) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? undefined : (req.user.schoolId as string);
    if (req.user.role !== 'SUPER_ADMIN') {
      this.classesService.assertSchoolAccess(req.user.role, req.user.schoolId, schoolId!);
    }
    return this.classesService.assignTeacher(body.userId, body.classId, body.sectionId, schoolId);
  }

  @Delete('assignment/:id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Remove teacher assignment' })
  removeTeacherAssignment(@Request() req: any, @Param('id') id: string) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? undefined : (req.user.schoolId as string);
    return this.classesService.removeTeacherAssignment(id, schoolId);
  }

  @Post(':classId/sections')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Create a section in a class' })
  createSection(
    @Request() req: any,
    @Param('classId') classId: string,
    @Body() body: { name: string },
  ) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? undefined : (req.user.schoolId as string);
    return this.classesService.createSection(classId, body.name, schoolId);
  }

  @Delete('sections/:id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Delete a section' })
  deleteSection(@Request() req: any, @Param('id') id: string) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? undefined : (req.user.schoolId as string);
    return this.classesService.deleteSection(id, schoolId);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN')
  @ApiOperation({ summary: 'Delete a class' })
  deleteClass(@Request() req: any, @Param('id') id: string) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? undefined : (req.user.schoolId as string);
    return this.classesService.deleteClass(id, schoolId);
  }
}
