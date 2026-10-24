import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity.js';
import { DEFAULT_FALLBACK_MESSAGE } from './tenants.service.js';

/** 動作確認用のデモテナント。SEED_DEMO=true のとき、未登録なら作成する */
export const DEMO_TENANT_KEY = 'pk_demo_clinic';

@Injectable()
export class TenantSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TenantSeedService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get('SEED_DEMO') !== 'true') return;
    if (await this.tenants.existsBy({ slug: 'demo-clinic' })) return;

    await this.tenants.save(
      this.tenants.create({
        slug: 'demo-clinic',
        name: 'デモ脱毛クリニック',
        publicKey: DEMO_TENANT_KEY,
        provider: 'mock',
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
    this.logger.log(`demo tenant created (publicKey: ${DEMO_TENANT_KEY})`);
  }
}

const DEMO_FAQ = [
  {
    keywords: ['予約', '予約方法', '予約したい'],
    answer:
      'ご予約はWeb予約ページから24時間受け付けています。お電話（10:00〜19:00）でも承ります。',
    source: 'よくある質問 > ご予約について',
  },
  {
    keywords: ['キャンセル', '変更', '日程'],
    answer:
      '予約の変更・キャンセルは前日18:00まで無料です。それ以降は1回分の施術を消化扱いとさせていただきます。',
    source: 'よくある質問 > キャンセルポリシー',
  },
  {
    keywords: ['料金', '値段', '価格', 'いくら'],
    answer:
      '全身脱毛5回コースは198,000円（税込）です。顔・VIOを含むプランもございます。詳しくは料金ページをご覧ください。',
    source: '料金表',
  },
  {
    keywords: ['痛い', '痛み'],
    answer:
      '冷却しながら照射する機器を使用しており、痛みは比較的少ないです。ご不安な場合は施術前に医師へご相談ください。',
    source: 'よくある質問 > 施術について',
  },
  {
    keywords: ['回数', '何回', '期間'],
    answer:
      '効果を実感いただける目安は5〜8回、2〜3か月に1回のペースで通っていただく方が多いです。',
    source: 'よくある質問 > 施術について',
  },
  {
    keywords: ['営業時間', '何時', '休み', '定休日'],
    answer: '診療時間は10:00〜19:00、定休日は水曜日です。',
    source: 'クリニック案内',
  },
];
