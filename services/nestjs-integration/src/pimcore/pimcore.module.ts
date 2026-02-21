/**
 * Pimcore Module for PIM integration.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PimcoreService } from './pimcore.service';

@Module({
  imports: [ConfigModule],
  providers: [PimcoreService],
  exports: [PimcoreService],
})
export class PimcoreModule {}
