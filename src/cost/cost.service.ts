import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { ProviderName } from '../tenants/tenant.entity.js';
import {
  type Assumptions,
  type CostEstimate,
  type CostModel,
  defaultsOf,
  estimateCost,
  fieldsOf,
  RegisterCostModel,
  resolveAssumptions,
} from './cost-model.js';
import type { EstimateCostDto } from './dto/estimate-cost.dto.js';

/** 会話ログから集計した利用量の実測値 */
export interface MeasuredUsage {
  days: number;
  /** 期間中の質問の数 */
  questions: number;
  /** 期間中に質問があったテナントの数 */
  activeTenants: number;
  /** 利用量が記録された回答の数（方式を呼んだ回答） */
  answersWithUsage: number;
  /** 質問のうち、問い合わせへ案内した割合 */
  fallbackRate: number | null;
  avgInputTokens: number | null;
  avgCachedInputTokens: number | null;
  avgOutputTokens: number | null;
  avgSearchCalls: number | null;
  /** 方式側が報告した金額の合計（Dify の total_price など） */
  reportedCostUsd: number;
  models: string[];
  /** 1社あたり月の質問数（期間の実績を30日に換算） */
  queriesPerTenantPerMonth: number | null;
}

/** @RegisterCostModel() が付いた見積もりモデルを集め、見積もりと実測値の集計を行う */
@Injectable()
export class CostService implements OnModuleInit {
  private readonly models = new Map<ProviderName, CostModel>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    const wrappers = this.discovery.getProviders({
      metadataKey: RegisterCostModel.KEY,
    });
    for (const { instance } of wrappers) {
      const model = instance as CostModel | undefined;
      if (model) this.models.set(model.approach, model);
    }
  }

  assumptions() {
    return [...this.models.values()].map((model) => ({
      approach: model.approach,
      label: model.label,
      fields: fieldsOf(model),
      defaults: defaultsOf(model),
    }));
  }

  async estimate(
    dto: EstimateCostDto,
  ): Promise<CostEstimate & { measured?: MeasuredUsage }> {
    const model = this.model(dto.approach);
    let overrides: Record<string, unknown> = {};
    let measured: MeasuredUsage | undefined;
    if (dto.useMeasuredUsage) {
      measured = await this.measuredUsage();
      overrides = measuredOverrides(model, measured);
    }
    let assumptions: Assumptions;
    try {
      assumptions = resolveAssumptions(model, {
        ...overrides,
        ...dto.assumptions,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    return {
      ...estimateCost(model, assumptions, dto.tenantCounts),
      ...(measured && { measured }),
    };
  }

  async measuredUsage(days = 30, tenantId?: string): Promise<MeasuredUsage> {
    const params: unknown[] = [days];
    const tenantFilter = tenantId
      ? `AND c."tenantId" = $${params.push(tenantId)}`
      : '';
    const [row] = await this.dataSource.query<Record<string, string | null>[]>(
      `SELECT
         count(*) FILTER (WHERE m.role = 'user')::int AS questions,
         count(DISTINCT c."tenantId") FILTER (WHERE m.role = 'user')::int AS "activeTenants",
         count(*) FILTER (WHERE m.role = 'assistant' AND m.status = 'fallback')::int AS fallbacks,
         count(*) FILTER (WHERE m.role = 'assistant')::int AS answers,
         count(m.usage)::int AS "answersWithUsage",
         avg((m.usage->>'inputTokens')::float) AS "avgInputTokens",
         avg(coalesce((m.usage->>'cachedInputTokens')::float, 0)) FILTER (WHERE m.usage IS NOT NULL) AS "avgCachedInputTokens",
         avg((m.usage->>'outputTokens')::float) AS "avgOutputTokens",
         avg(coalesce((m.usage->>'searchCalls')::float, 0)) FILTER (WHERE m.usage IS NOT NULL) AS "avgSearchCalls",
         coalesce(sum((m.usage->>'reportedCostUsd')::float), 0) AS "reportedCostUsd",
         coalesce(array_agg(DISTINCT m.usage->>'model') FILTER (WHERE m.usage->>'model' IS NOT NULL), '{}') AS models
       FROM messages m
       JOIN conversations c ON c.id = m."conversationId"
       WHERE m."createdAt" >= now() - make_interval(days => $1) ${tenantFilter}`,
      params,
    );
    const n = (key: string) => (row[key] === null ? null : Number(row[key]));
    const questions = Number(row.questions);
    const activeTenants = Number(row.activeTenants);
    const answers = Number(row.answers);
    return {
      days,
      questions,
      activeTenants,
      answersWithUsage: Number(row.answersWithUsage),
      fallbackRate: answers > 0 ? Number(row.fallbacks) / answers : null,
      avgInputTokens: n('avgInputTokens'),
      avgCachedInputTokens: n('avgCachedInputTokens'),
      avgOutputTokens: n('avgOutputTokens'),
      avgSearchCalls: n('avgSearchCalls'),
      reportedCostUsd: Number(row.reportedCostUsd),
      models: row.models as unknown as string[],
      queriesPerTenantPerMonth:
        activeTenants > 0 ? (questions / activeTenants) * (30 / days) : null,
    };
  }

  private model(approach?: ProviderName): CostModel {
    const model = approach
      ? this.models.get(approach)
      : this.models.values().next().value;
    if (!model) {
      throw new NotFoundException(
        `no cost model for "${approach ?? '(any)'}" (registered: ${[...this.models.keys()].join(', ') || 'none'})`,
      );
    }
    return model;
  }
}

/**
 * 実測値で置き換える前提。トークン数は方式を呼んだ回答の平均。
 * 質問数は、デモや動作確認のログでは実態と離れるので置き換えない。
 */
function measuredOverrides(
  model: CostModel,
  m: MeasuredUsage,
): Record<string, unknown> {
  if (m.answersWithUsage === 0 || m.avgInputTokens === null) return {};
  const overrides: Record<string, unknown> = {
    inputTokensPerQuery: Math.round(m.avgInputTokens),
    outputTokensPerQuery: Math.round(m.avgOutputTokens ?? 0),
    cachedInputRatio:
      m.avgInputTokens > 0
        ? (m.avgCachedInputTokens ?? 0) / m.avgInputTokens
        : 0,
  };
  if (model.fields.some((f) => f.key === 'searchCallsPerQuery')) {
    overrides.searchCallsPerQuery = m.avgSearchCalls ?? 0;
  }
  return overrides;
}
