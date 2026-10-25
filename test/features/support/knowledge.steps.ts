import { expect } from 'vitest';
import type { KnowledgeDocument } from '../../../src/knowledge/knowledge-document.entity.js';
import { type Row, step } from './steps.js';
import { world } from './world.js';

/** 資料の登録・管理のステップ */

function knowledgePath(tenantName?: string) {
  return `/admin/tenants/${world.tenant(tenantName).id}/knowledge`;
}

async function listKnowledge(
  tenantName?: string,
): Promise<KnowledgeDocument[]> {
  const res = await world.http().get(knowledgePath(tenantName));
  expect(res.status).toBe(200);
  return res.body as KnowledgeDocument[];
}

async function addText(body: Record<string, string>, tenantName?: string) {
  world.response = await world
    .http()
    .post(knowledgePath(tenantName))
    .send(body);
  return world.response;
}

step(
  '次の FAQ を {string} として登録している:',
  async (_, title: string, rows: Row[]) => {
    const res = await world
      .http()
      .post(`${knowledgePath()}/faq`)
      .send({
        title,
        items: rows.map((r) => ({ question: r.質問, answer: r.回答 })),
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  },
);

step(
  '題名 {string} 、本文 {string} の資料を登録する',
  (_, title: string, content: string) => addText({ title, content }),
);

step(
  '題名 {string} 、本文 {string} 、元のページ {string} の資料を登録する',
  (_, title: string, content: string, sourceUrl: string) =>
    addText({ title, content, sourceUrl }),
);

step(
  '{string} に題名 {string} 、本文 {string} の資料を登録する',
  (_, tenantName: string, title: string, content: string) =>
    addText({ title, content }, tenantName),
);

step(
  'ファイル {string} を内容 {string} でアップロードする',
  async (_, filename: string, content: string) => {
    world.response = await world
      .http()
      .post(`${knowledgePath()}/upload`)
      .attach('file', Buffer.from(content), {
        filename,
        contentType: 'text/markdown',
      });
  },
);

step('資料の一覧は次のとおりである:', async (_, rows: Row[]) => {
  const docs = await listKnowledge();
  expect(docs.map((d) => ({ 題名: d.title, 状態: d.status }))).toEqual(rows);
});

step('資料の一覧は空である', async () => {
  expect(await listKnowledge()).toEqual([]);
});

async function removeKnowledge(title: string, asTenant?: string) {
  const doc = (await listKnowledge()).find((d) => d.title === title);
  if (!doc) throw new Error(`knowledge "${title}" is not registered`);
  world.response = await world
    .http()
    .delete(`${knowledgePath(asTenant)}/${doc.id}`);
}

step('資料 {string} を削除する', (_, title: string) => removeKnowledge(title));

step(
  '{string} として資料 {string} を削除する',
  (_, tenantName: string, title: string) => removeKnowledge(title, tenantName),
);
