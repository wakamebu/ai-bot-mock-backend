import { PartialType } from '@nestjs/mapped-types';
import { CreateTenantDto } from './create-tenant.dto.js';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
