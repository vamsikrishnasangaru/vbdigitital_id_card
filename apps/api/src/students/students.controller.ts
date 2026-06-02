import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Students')
@Controller('students')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a student with optional photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo'))
  create(@Body() body: any, @UploadedFile() file?: Express.Multer.File) {
    // If file is provided, it will be handled by the service to save and get a URL
    return this.studentsService.create(body, file);
  }

  @Get()
  @ApiOperation({ summary: 'List students with filters' })
  findAll(
    @Query('schoolId') schoolId?: string,
    @Query('classId') classId?: string,
    @Query('sectionId') sectionId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('templateCode') templateCode?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.studentsService.findAll({
      schoolId, classId, sectionId, status, search, templateCode,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get('class-stats/:schoolId')
  @ApiOperation({ summary: 'Get class-wise student statistics' })
  getClassWiseStats(@Param('schoolId') schoolId: string) {
    return this.studentsService.getClassWiseStats(schoolId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get student details' })
  findOne(@Param('id') id: string) {
    return this.studentsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update student' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.studentsService.update(id, body);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update student status' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: any) {
    return this.studentsService.updateStatus(id, body.status, req.user.sub);
  }

  @Post('bulk-import')
  @ApiOperation({ summary: 'Bulk import students (validated class/section IDs)' })
  bulkImport(@Request() req: any, @Body() body: { schoolId: string; students: any[] }) {
    const schoolId =
      req.user.role === 'SUPER_ADMIN' ? body.schoolId : (req.user.schoolId as string);
    return this.studentsService.bulkImport(schoolId, body.students ?? [], {
      role: req.user.role,
      schoolId: req.user.schoolId,
    });
  }

  @Post('bulk-status')
  @ApiOperation({ summary: 'Bulk update student status' })
  bulkUpdateStatus(@Body() body: { ids: string[]; status: string }, @Request() req: any) {
    return this.studentsService.bulkUpdateStatus(body.ids, body.status, req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete student' })
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}
