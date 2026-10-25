import { defineSteps } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { Message } from '../../../src/conversations/message.entity.js';
import { DEFAULT_FALLBACK_MESSAGE } from '../../../src/tenants/tenants.service.js';
import { world } from './world.js';

type Row = Record<string, string>;
type StepFn = (ctx: unknown, ...params: any[]) => unknown;

/**
 * 全 feature で共有するステップを登録する。
 * 「前提 / もし / ならば / かつ / しかし」のどれで書かれても同じステップとして扱う。
 * （vitest-cucumber の汎用 Step はシナリオアウトラインで一致しないため、キーワードごとに登録する）
 */
function step(pattern: string, fn: StepFn) {
  defineSteps((keywords) => {
    for (const keyword of ['Given', 'When', 'Then', 'And', 'But'] as const) {
      keywords[keyword](pattern, async (ctx: unknown, ...params: unknown[]) => {
        await fn(ctx, ...params);
      });
    }
  });
}

let slugSequence = 0;

async function updateTenant(body: Record<string, unknown>, name?: string) {
  world.response = await world
    .http()
    .patch(`/admin/tenants/${world.tenant(name).id}`)
    .send(body);
  return world.response;
}

async function givenTenantUpdated(body: Record<string, unknown>) {
  const res = await updateTenant(body);
  expect(res.status).toBe(200);
}

async function conversationMessages(): Promise<Message[]> {
  const { conversationId } = world.lastChat;
  const res = await world
    .http()
    .get(`/admin/tenants/${world.tenant().id}/conversations/${conversationId}`);
  expect(res.status).toBe(200);
  return res.body.messages as Message[];
}

// ---------------------------------------------------------------- テナント

step('テナント {string} が登録されている', async (_, name: string) => {
  const res = await world
    .http()
    .post('/admin/tenants')
    .send({ slug: `tenant-${++slugSequence}`, name });
  expect(res.status).toBe(201);
  world.tenants.set(name, { id: res.body.id, publicKey: res.body.publicKey });
  world.primaryTenantName ??= name;
});

step(
  'スラッグ {string} 、名前 {string} でテナントを登録する',
  async (_, slug: string, name: string) => {
    world.response = await world
      .http()
      .post('/admin/tenants')
      .send({ slug, name });
    if (world.response.status === 201) {
      world.tenants.set(name, {
        id: world.response.body.id,
        publicKey: world.response.body.publicKey,
      });
      world.primaryTenantName ??= name;
    }
  },
);

step('テナントの確信度のしきい値は {number} である', (_, value: number) =>
  givenTenantUpdated({ confidenceThreshold: value }),
);

step('テナントの確信度のしきい値を {number} に変更する', (_, value: number) =>
  updateTenant({ confidenceThreshold: value }),
);

step('テナントの担当者へ回すキーワードは {string} である', (_, list: string) =>
  givenTenantUpdated({ handoffKeywords: list.split(/\s*[,、]\s*/) }),
);

step('テナントの案内文は {string} である', (_, message: string) =>
  givenTenantUpdated({ fallbackMessage: message }),
);

step('テナントの問い合わせ先は {string} である', (_, url: string) =>
  givenTenantUpdated({ contactUrl: url }),
);

step('テナントの許可オリジンは {string} である', (_, origin: string) =>
  givenTenantUpdated({ allowedOrigins: [origin] }),
);

step('テナントの公開キーを再発行する', async () => {
  const tenant = world.tenant();
  world.previousPublicKey = tenant.publicKey;
  world.response = await world
    .http()
    .post(`/admin/tenants/${tenant.id}/rotate-key`);
  expect(world.response.status).toBe(201);
  tenant.publicKey = world.response.body.publicKey;
});

step('公開キーは {string} で始まる', (_, prefix: string) => {
  expect(world.response!.body.publicKey).toMatch(new RegExp(`^${prefix}`));
});

step('案内文には既定の文が入っている', () => {
  expect(world.response!.body.fallbackMessage).toBe(DEFAULT_FALLBACK_MESSAGE);
});

step('登録内容は次のとおりである:', (_, rows: Row[]) => {
  for (const { 項目, 値 } of rows) {
    expect(String(world.response!.body[項目]), 項目).toBe(値);
  }
});

// ---------------------------------------------------------------- 方式

step('方式は次のように回答する:', (_, [row]: Row[]) => {
  world.provider.willRespond({
    answer: row.回答,
    answerable: true,
    confidence: Number(row.確信度),
    sources: row.根拠 ? [{ title: row.根拠 }] : [],
  });
});

step(
  '方式は {string} 、確信度 {string} で回答する',
  (_, answerable: string, confidence: string) => {
    const canAnswer = answerable === '答えられる';
    world.provider.willRespond({
      answer: canAnswer ? '方式の回答です' : '',
      answerable: canAnswer,
      confidence: confidence === 'なし' ? null : Number(confidence),
    });
  },
);

step(
  '方式は入力 {int} トークン、出力 {int} トークンを使って回答する',
  (_, inputTokens: number, outputTokens: number) => {
    world.provider.willRespond({ usage: { inputTokens, outputTokens } });
  },
);

step('方式の呼び出しが失敗する', () => {
  world.provider.willFail();
});

step('方式には問い合わせていない', () => {
  expect(world.provider.calls).toHaveLength(0);
});

step('方式には直前までのやり取りが {int} 件渡される', (_, count: number) => {
  expect(world.provider.calls.at(-1)?.history).toHaveLength(count);
});

// ---------------------------------------------------------------- 質問する

step('{string} と質問する', (_, message: string) => world.chat({ message }));

step('同じ会話で {string} と質問する', (_, message: string) =>
  world.chat({ message, conversationId: world.lastChat.conversationId }),
);

step('公開キーを付けずに {string} と質問する', (_, message: string) =>
  world.chat({ message, publicKey: null }),
);

step(
  '公開キー {string} で {string} と質問する',
  (_, publicKey: string, message: string) => world.chat({ message, publicKey }),
);

step(
  'オリジン {string} から {string} と質問する',
  (_, origin: string, message: string) => world.chat({ message, origin }),
);

step(
  '{string} のチャット欄で {string} と質問する',
  (_, name: string, message: string) =>
    world.chat({ message, publicKey: world.tenant(name).publicKey }),
);

step(
  'その会話を {string} のチャット欄で続けて {string} と質問する',
  (_, name: string, message: string) =>
    world.chat({
      message,
      publicKey: world.tenant(name).publicKey,
      conversationId: world.lastChat.conversationId,
    }),
);

step('{string} 文字の質問をする', (_, length: string) =>
  world.chat({ message: 'あ'.repeat(Number(length)) }),
);

step('古い公開キーでは利用できない', async () => {
  const res = await world.chat({
    message: 'こんにちは',
    publicKey: world.previousPublicKey,
  });
  expect(res.status).toBe(401);
});

step('新しい公開キーでは利用できる', async () => {
  const res = await world.chat({ message: 'こんにちは' });
  expect(res.status).toBe(200);
});

// ---------------------------------------------------------------- 結果

step('ステータスコード {string} が返る', (_, status: string) => {
  expect(world.response!.status, JSON.stringify(world.response!.body)).toBe(
    Number(status),
  );
});

step('回答として扱われる', () => {
  expect(world.response!.status).toBe(200);
  expect(world.lastChat.status).toBe('answered');
  expect(world.lastChat.fallback).toBeUndefined();
});

step('{string} を理由に問い合わせへ案内される', (_, reason: string) => {
  expect(world.response!.status).toBe(200);
  expect(world.lastChat.status).toBe('fallback');
  expect(world.lastChat.fallback?.reason).toBe(reason);
});

step('回答は {string} である', (_, answer: string) => {
  expect(world.lastChat.answer).toBe(answer);
});

step('根拠として {string} が示される', (_, title: string) => {
  expect(world.lastChat.sources.map((s) => s.title)).toContain(title);
});

step('根拠は示されない', () => {
  expect(world.lastChat.sources).toEqual([]);
});

step('問い合わせ先として {string} が示される', (_, url: string) => {
  expect(world.lastChat.fallback?.contactUrl).toBe(url);
});

step('2つの質問は同じ会話として扱われる', () => {
  const [first, second] = world.chatResponses;
  expect(second.conversationId).toBe(first.conversationId);
});

// ---------------------------------------------------------------- 会話ログ

step('会話ログに次の発言が記録されている:', async (_, rows: Row[]) => {
  const messages = await conversationMessages();
  expect(
    messages.map((m) => ({
      発言者: m.role,
      内容: m.content,
      結果: m.status ?? '',
    })),
  ).toEqual(rows);
});

step(
  '会話ログの最後の回答には、確信度 {number} と根拠 {string} が記録されている',
  async (_, confidence: number, title: string) => {
    const last = (await conversationMessages()).at(-1)!;
    expect(last.role).toBe('assistant');
    expect(last.confidence).toBeCloseTo(confidence);
    expect(last.sources.map((s) => s.title)).toContain(title);
  },
);

step(
  '会話ログの最後の回答には、入力 {int} トークン、出力 {int} トークンが記録されている',
  async (_, inputTokens: number, outputTokens: number) => {
    const last = (await conversationMessages()).at(-1)!;
    expect(last.usage).toMatchObject({ inputTokens, outputTokens });
  },
);

step(
  '{string} の会話ログは {int} 件である',
  async (_, name: string, count: number) => {
    const res = await world
      .http()
      .get(`/admin/tenants/${world.tenant(name).id}/conversations`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(count);
  },
);

// ---------------------------------------------------------------- システム

step('システムの状態を確認する', async () => {
  world.response = await world.http().get('/health');
});

step('DB に接続できている', () => {
  expect(world.response!.body).toEqual({ status: 'ok', db: 'up' });
});

step('ログイン中のユーザーを取得する', async () => {
  world.response = await world.http().get('/auth/me');
});

step('未ログインとして返る', () => {
  expect(world.response!.body).toEqual({ user: null, mock: true });
});
