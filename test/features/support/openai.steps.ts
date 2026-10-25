import { expect } from 'vitest';
import { conversationMessages, step } from './steps.js';
import { world } from './world.js';

/** OpenAI File Search 方式のステップ。OpenAI は偽物（tools/fake-openai）を使う */

async function vectorStoreIdOf(
  tenantName?: string,
): Promise<string | undefined> {
  const res = await world
    .http()
    .get(`/admin/tenants/${world.tenant(tenantName).id}`);
  return res.body.providerConfig?.vectorStoreId as string | undefined;
}

function lastResponsesRequest() {
  const request = world.openai.responseRequests.at(-1);
  if (!request) throw new Error('OpenAI Responses API was not called');
  return request;
}

step(
  'テナントの providerConfig に Vector Store の ID が記録されている',
  async () => {
    const id = await vectorStoreIdOf();
    expect(id).toMatch(/^vs_/);
    expect(world.openai.vectorStore(id!)).toBeDefined();
  },
);

step(
  'OpenAI には {string} の Vector Store だけを検索させている',
  async (_, tenantName: string) => {
    const tools = lastResponsesRequest().tools as {
      type: string;
      vector_store_ids: string[];
    }[];
    expect(tools).toEqual([
      expect.objectContaining({
        type: 'file_search',
        vector_store_ids: [await vectorStoreIdOf(tenantName)],
      }),
    ]);
  },
);

step(
  'OpenAI への最後のリクエストには、直前までのやり取りが {int} 件含まれる',
  (_, count: number) => {
    // 今回の質問の分を足す
    expect(lastResponsesRequest().input).toHaveLength(count + 1);
  },
);

step('OpenAI には会話を保存させていない', () => {
  expect(lastResponsesRequest().store).toBe(false);
});

step('OpenAI のモデルは {string} と判断する', (_, judgement: string) => {
  world.openai.willRespond({
    answerable: judgement === '答えられる',
    answer: '',
  });
});

step('OpenAI の検索結果のスコアは {number} である', (_, score: number) => {
  world.openai.willRespond({
    results: [
      {
        score,
        text: 'Q: 予約\nA: Web予約ページから予約できます。',
        attributes: { title: 'よくある質問' },
      },
    ],
  });
});

step('OpenAI のモデルは {string} とだけ出力する', (_, text: string) => {
  world.openai.willRespond({ rawText: text });
});

step(
  'OpenAI は次の {int} 回、ステータス {int} を返す',
  (_, times: number, status: number) => {
    world.openai.willFail(status, times);
  },
);

step('OpenAI はステータス {string} を返し続ける', (_, status: string) => {
  world.openai.willFail(Number(status));
});

step('OpenAI には問い合わせていない', () => {
  expect(world.openai.responseRequests).toHaveLength(0);
});

step('OpenAI の Vector Store からも資料が削除されている', async () => {
  const store = world.openai.vectorStore((await vectorStoreIdOf())!);
  expect(store?.files).toEqual([]);
});

step('会話ログの最後の回答には、OpenAI の利用量が記録されている', async () => {
  const last = (await conversationMessages()).at(-1)!;
  expect(last.usage).toMatchObject({ model: 'gpt-5-mini', searchCalls: 1 });
  expect(last.usage!.inputTokens).toBeGreaterThan(0);
  expect(last.usage!.outputTokens).toBeGreaterThan(0);
});
