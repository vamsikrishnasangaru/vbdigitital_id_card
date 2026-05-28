import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IdCardsService } from './id-cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('ID Cards')
@Controller('id-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class IdCardsController {
  constructor(private readonly idCardsService: IdCardsService) {}

  @Post('generate')
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'Generate ID cards for students' })
  generate(@Body() body: { templateId: string; studentIds: string[] }) {
    return this.idCardsService.generate(body.templateId, body.studentIds);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER')
  @ApiOperation({ summary: 'List generated ID cards' })
  findAll(@Query('studentId') studentId?: string, @Query('status') status?: string) {
    return this.idCardsService.findAll({ studentId, status });
  }
}
