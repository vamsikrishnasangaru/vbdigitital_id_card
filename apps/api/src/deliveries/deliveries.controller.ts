import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { DeliveriesService } from './deliveries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Deliveries')
@Controller('deliveries')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create delivery' })
  create(@Body() body: any) { return this.deliveriesService.create(body); }

  @Get()
  @ApiOperation({ summary: 'List deliveries' })
  findAll(
    @Query('schoolId') schoolId?: string, @Query('status') status?: string,
    @Query('page') page?: string, @Query('limit') limit?: string,
  ) {
    return this.deliveriesService.findAll({ schoolId, status, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery details' })
  findOne(@Param('id') id: string) { return this.deliveriesService.findOne(id); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update delivery status' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: any) {
    return this.deliveriesService.updateStatus(id, body.status, req.user?.sub);
  }
}
