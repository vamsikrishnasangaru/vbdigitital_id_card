import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private contact: ContactService) {}

  @Post()
  @ApiOperation({ summary: 'Submit a public contact inquiry from the landing or sign-in page' })
  submit(@Body() dto: CreateContactDto) {
    return this.contact.submit(dto);
  }
}
