import { expect } from 'vitest';
import type { Conversation } from '../../../src/conversations/conversation.entity.js';
import { conversationMessages, step } from './steps.js';
import { world } from './world.js';

/** Dify 方式のステップ。Dify は偽物（tools/fake-dify）を使う */

async function providerConfigOf(tenantName?: string): Promise<Record<string, string>> {
  const res = await world.http().get(`/admin/tenants/${world.tenant(tenantName).id}`);
  return res.body.providerConfig as Record<string, string>;
}

async function instanceIdOf(tenantName?: string): Promise<string | undefined> {
  return world.dify.instanceByBaseUrl((await providerConfigOf(tenantName)).baseUrl)?.id;
}

function lastChatRequest() {
  const request = world.dify.chatRequests.at(-1);
  if (!request) throw new Error('Dify chat API was not called');
  return request;
}

async function currentConversation(): Promise<Conversation> {
  const res = await world
    .http()
    .get(`/admin/tenants/${world.tenant().id}/conversations/${world.lastChat.conversationId}`);
  return res.body as Conversation;
}

step('テナントに専用の Dify が用意され、接続先が記録されている', async () => {
  const config = await providerConfigOf();
  expect(config).toEqual({
    baseUrl: expect.stringMatching(/^http:\/\/localhost:\d+\/i\/\w+$/),
    apiKey: expect.any(String),
    datasetId: expect.any(String),
    datasetApiKey: expect.any(String),
  });
  expect(world.dify.instanceByBaseUrl(config.baseUrl)).toBeDefined();
});

step('{string} と {string} には別々の Dify が用意されている', async (_, a: string, b: string) => {
  const [idA, idB] = [await instanceIdOf(a), await instanceIdOf(b)];
  expect(idA).toBeDefined();
  expect(idB).toBeDefined();
  expect(idA).not.toBe(idB);
});

step('Dify への最後の問い合わせは {string} の Dify に送られている', async (_, tenantName: string) => {
  expect(lastChatRequest().instanceId).toBe(await instanceIdOf(tenantName));
});

step('Dify には利用者としてこちらの会話IDを渡している', () => {
  expect((lastChatRequest().body as { user: string }).user).toBe(world.lastChat.conversationId);
});

step('Dify への最後の問い合わせには、Dify の会話IDが渡されている', async () => {
  const sent = (lastChatRequest().body as { conversation_id?: string }).conversation_id;
  expect(sent).toBeDefined();
  expect(sent).toBe((await currentConversation()).providerConversationId);
});

step('Dify への最後の問い合わせは、Dify の会話IDなしでやり直している', () => {
  const [failed, retried] = world.dify.chatRequests.slice(-2).map((r) => r.body as { conversation_id?: string });
  expect(failed.conversation_id).toBeDefined();
  expect(retried.conversation_id).toBeUndefined();
});

step('Dify のチャットフローは答えられない目印を返す', () => {
  world.dify.willRespond({ answer: '[[NO_ANSWER]]' });
});

step('Dify の検索結果のスコアは {number} である', (_, score: number) => {
  world.dify.willRespond({
    resources: [{ score, document_name: 'よくある質問', content: 'Q: 予約\nA: Web予約ページから予約できます。' }],
  });
});

step('Dify 側の会話が期限切れで消えている', () => {
  world.dify.expireConversations();
});

step('Dify はステータス {string} を返し続ける', (_, status: string) => {
  world.dify.willFail(Number(status));
});

step('Dify の応答が時間切れになる', () => {
  world.dify.willDelay(3_000);
});

step('Dify には問い合わせていない', () => {
  expect(world.dify.chatRequests).toHaveLength(0);
});

step('Dify のナレッジからも資料が削除されている', async () => {
  const instance = world.dify.instance((await instanceIdOf())!);
  expect(instance?.documents).toEqual([]);
});

step('会話ログの最後の回答には、Dify の利用量が記録されている', async () => {
  const last = (await conversationMessages()).at(-1)!;
  expect(last.usage!.inputTokens).toBeGreaterThan(0);
  expect(last.usage!.outputTokens).toBeGreaterThan(0);
  expect(last.usage!.reportedCostUsd).toBeGreaterThan(0);
});
