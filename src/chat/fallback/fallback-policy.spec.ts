import { checkAfterGenerate, checkBeforeGenerate } from './fallback-policy.js';

const tenant = {
  handoffKeywords: ['妊娠', 'アトピー'],
  confidenceThreshold: 0.6,
};
const result = {
  answer: '予約はWebからできます',
  answerable: true,
  confidence: 0.9,
  sources: [],
};

describe('checkBeforeGenerate', () => {
  it('担当者へ回すキーワードを含む質問は sensitive', () => {
    expect(checkBeforeGenerate(tenant, '妊娠中でも施術できますか')).toBe(
      'sensitive',
    );
  });

  it('全角・半角や大文字小文字の違いを吸収する', () => {
    const t = { ...tenant, handoffKeywords: ['ＶＩＯ'] };
    expect(checkBeforeGenerate(t, 'vioの相談')).toBe('sensitive');
  });

  it('該当しなければ null', () => {
    expect(checkBeforeGenerate(tenant, '予約方法を教えて')).toBeNull();
  });
});

describe('checkAfterGenerate', () => {
  it('しきい値以上なら null', () => {
    expect(checkAfterGenerate(tenant, result)).toBeNull();
  });

  it('answerable=false は out_of_scope', () => {
    expect(checkAfterGenerate(tenant, { ...result, answerable: false })).toBe(
      'out_of_scope',
    );
  });

  it('空の回答は out_of_scope', () => {
    expect(checkAfterGenerate(tenant, { ...result, answer: '  ' })).toBe(
      'out_of_scope',
    );
  });

  it('しきい値未満は low_confidence', () => {
    expect(checkAfterGenerate(tenant, { ...result, confidence: 0.3 })).toBe(
      'low_confidence',
    );
  });

  it('confidence=null はしきい値判定をしない', () => {
    expect(
      checkAfterGenerate(tenant, { ...result, confidence: null }),
    ).toBeNull();
  });
});
