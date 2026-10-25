import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { Tenant } from './tenant.entity.js';

export const DEFAULT_FALLBACK_MESSAGE =
  '申し訳ありません、このご質問にはチャットでお答えできません。担当者よりご連絡しますので、お問い合わせフォームからご連絡ください。';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  findAll(): Promise<Tenant[]> {
    return this.tenants.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenants.findOneBy({ id });
    if (!tenant) throw new NotFoundException('tenant not found');
    return tenant;
  }

  findByPublicKey(publicKey: string): Promise<Tenant | null> {
    return this.tenants.findOneBy({ publicKey });
  }

  create(dto: CreateTenantDto): Promise<Tenant> {
    const tenant = this.tenants.create(dto);
    tenant.publicKey = generatePublicKey();
    tenant.fallbackMessage = dto.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE;
    return this.tenants.save(tenant).catch(rethrowUniqueViolation);
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findOne(id);
    return this.tenants
      .save(this.tenants.merge(tenant, dto))
      .catch(rethrowUniqueViolation);
  }

  async rotatePublicKey(id: string): Promise<Tenant> {
    const tenant = await this.findOne(id);
    tenant.publicKey = generatePublicKey();
    return this.tenants.save(tenant);
  }
}

/** PostgreSQL の一意制約違反（slug の重複など）を 409 にする */
function rethrowUniqueViolation(error: unknown): never {
  if (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  ) {
    throw new ConflictException('tenant already exists');
  }
  throw error;
}

function generatePublicKey(): string {
  return `pk_${randomBytes(16).toString('hex')}`;
}
