/**
 * MedusaJS Module for headless commerce integration.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MedusaService } from './medusa.service';
import { MedusaSyncListener } from './medusa-sync.listener';

@Module({
  imports: [ConfigModule],
  providers: [MedusaService, MedusaSyncListener],
  exports: [MedusaService],
})
export class MedusaModule {}
