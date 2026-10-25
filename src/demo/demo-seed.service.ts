import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import {
  PROVIDER_NAMES,
  type ProviderName,
  Tenant,
} from '../tenants/tenant.entity.js';
import { DEFAULT_FALLBACK_MESSAGE } from '../tenants/tenants.service.js';

/**
 * 動作確認用のデモテナント。SEED_DEMO=true のとき、未登録なら作成する。
 * DEMO_PROVIDER（mock / openai）でデモテナントの方式を切り替える。
 * mock 以外では、デモの FAQ を資料として登録する（未登録の場合のみ）。
 */
export const DEMO_TENANT_KEY = 'pk_demo_clinic';

@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    private readonly knowledge: KnowledgeService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('SEED_DEMO') !== 'true') return;
    const provider = this.demoProvider();
    let tenant = await this.tenants.findOneBy({ slug: 'demo-clinic' });
    if (!tenant) {
      tenant = await this.createTenant(provider);
    } else if (tenant.provider !== provider) {
      tenant.provider = provider;
      tenant = await this.tenants.save(tenant);
      this.logger.log(`demo tenant provider changed to ${provider}`);
    }
    if (provider !== 'mock') await this.seedKnowledge(tenant);
  }

  private demoProvider(): ProviderName {
    const value = this.config.get<string>('DEMO_PROVIDER') || 'mock';
    if (!(PROVIDER_NAMES as readonly string[]).includes(value)) {
      throw new Error(
        `DEMO_PROVIDER must be one of ${PROVIDER_NAMES.join(', ')}`,
      );
    }
    return value as ProviderName;
  }

  private async seedKnowledge(tenant: Tenant) {
    try {
      if ((await this.knowledge.list(tenant.id)).length > 0) return;
      await this.knowledge.addFaq(tenant.id, {
        title: 'よくある質問',
        sourceUrl: 'http://localhost:3001/demo.html#faq',
        items: DEMO_FAQ.map(({ question, answer }) => ({ question, answer })),
      });
      this.logger.log(`demo knowledge registered (${DEMO_FAQ.length} items)`);
    } catch (error) {
      // 方式側（偽の OpenAI など）が起動していなくても、アプリは起動させる
      this.logger.warn(`failed to register demo knowledge: ${String(error)}`);
    }
  }

  private async createTenant(provider: ProviderName): Promise<Tenant> {
    const tenant = await this.tenants.save(
      this.tenants.create({
        slug: 'demo-clinic',
        name: 'デモ脱毛クリニック',
        publicKey: DEMO_TENANT_KEY,
        provider,
        providerConfig: { faq: DEMO_FAQ },
        handoffKeywords: [
          '妊娠',
          '授乳',
          '持病',
          '服薬',
          '薬',
          'アトピー',
          '肌荒れ',
          'やけど',
          '火傷',
          '副作用',
          '赤み',
          '腫れ',
        ],
        fallbackMessage: DEFAULT_FALLBACK_MESSAGE,
        contactUrl: 'http://localhost:3001/demo.html#contact',
      }),
    );
    this.logger.log(
      `demo tenant created (publicKey: ${DEMO_TENANT_KEY}, provider: ${provider})`,
    );
    return tenant;
  }
}

/** mock は keywords で、mock 以外は question と answer を資料として登録して使う */
const DEMO_FAQ = [
  {
    question: '予約方法を教えてください',
    keywords: ['予約', '予約方法', '予約したい'],
    answer:
      'ご予約はWeb予約ページから24時間受け付けています。お電話（10:00〜19:00）でも承ります。',
    source: 'よくある質問 > ご予約について',
  },
  {
    question: '予約の変更・キャンセルはできますか',
    keywords: ['キャンセル', '変更', '日程'],
    answer:
      '予約の変更・キャンセルは前日18:00まで無料です。それ以降は1回分の施術を消化扱いとさせていただきます。',
    source: 'よくある質問 > キャンセルポリシー',
  },
  {
    question: '全身脱毛の料金はいくらですか',
    keywords: ['料金', '値段', '価格', 'いくら'],
    answer:
      '全身脱毛5回コースは198,000円（税込）です。顔・VIOを含むプランもございます。詳しくは料金ページをご覧ください。',
    source: '料金表',
  },
  {
    question: '脱毛は痛いですか',
    keywords: ['痛い', '痛み'],
    answer:
      '冷却しながら照射する機器を使用しており、痛みは比較的少ないです。ご不安な場合は施術前に医師へご相談ください。',
    source: 'よくある質問 > 施術について',
  },
  {
    question: '何回くらい通えば効果がありますか',
    keywords: ['回数', '何回', '期間'],
    answer:
      '効果を実感いただける目安は5〜8回、2〜3か月に1回のペースで通っていただく方が多いです。',
    source: 'よくある質問 > 施術について',
  },
  {
    question: '診療時間と定休日を教えてください',
    keywords: ['営業時間', '何時', '休み', '定休日'],
    answer: '診療時間は10:00〜19:00、定休日は水曜日です。',
    source: 'クリニック案内',
  },
];
