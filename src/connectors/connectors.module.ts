import { Module } from '@nestjs/common';
import { ConnectorsController } from './connectors.controller';
import { GmailService } from './gmail.service';
import { AiModule } from '../ai/ai.module';

@Module({ imports: [AiModule], controllers: [ConnectorsController], providers: [GmailService] })
export class ConnectorsModule {}
