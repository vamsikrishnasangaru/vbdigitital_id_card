import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';
import { DuplicateTemplateDto } from './dto/duplicate-template.dto';

@ApiTags('Templates')
@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create template' })
  create(@Body() dto: CreateTemplateDto) { return this.templatesService.create(dto); }

  @Get()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List templates' })
  findAll(
    @Request() req: { user: { role: string; schoolId?: string } },
    @Query('schoolId') schoolId?: string,
    @Query('search') search?: string,
    @Query('allSchools') allSchools?: string,
  ) {
    const scopedSchoolId =
      req.user.role === 'SUPER_ADMIN' ? schoolId : (req.user.schoolId as string | undefined);
    const scopedAllSchools = req.user.role === 'SUPER_ADMIN' && allSchools === 'true';
    return this.templatesService.findAll(scopedSchoolId, search, scopedAllSchools);
  }

  @Post(':id/duplicate')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Duplicate template to another school with a new code' })
  duplicate(@Param('id') id: string, @Body() dto: DuplicateTemplateDto) {
    return this.templatesService.duplicate(id, dto);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Get template' })
  findOne(@Param('id') id: string) { return this.templatesService.findOne(id); }

  @Put(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Update template' })
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) { return this.templatesService.update(id, dto); }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete template' })
  remove(@Param('id') id: string) { return this.templatesService.remove(id); }
}
