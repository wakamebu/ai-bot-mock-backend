import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/tenant.entity.js';
import { DemoSeedService } from './demo-seed.service.js';

/** デモ用のテナント（SEED_DEMO=true のときに作成）。デモページは public/demo.html */
@Module({
  imports: [TypeOrmModule.forFeature([Tenant])],
  providers: [DemoSeedService],
})
export class DemoModule {}
