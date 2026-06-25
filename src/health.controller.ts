import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  ok() {
    return { ok: true, service: 'fampilot-api', ts: new Date().toISOString() };
  }
}
