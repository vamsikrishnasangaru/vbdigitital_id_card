import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create order' })
  create(@Body() body: { schoolId: string; studentIds: string[]; notes?: string }) {
    return this.ordersService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List orders' })
  findAll(
    @Query('schoolId') schoolId?: string, @Query('status') status?: string,
    @Query('page') page?: string, @Query('limit') limit?: string,
  ) {
    return this.ordersService.findAll({ schoolId, status, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order details' })
  findOne(@Param('id') id: string) { return this.ordersService.findOne(id); }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }, @Request() req: any) {
    return this.ordersService.updateStatus(id, body.status, req.user.sub);
  }
}
