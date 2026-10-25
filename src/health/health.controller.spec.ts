import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('DB に問い合わせできれば ok を返す', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: { query } }],
    }).compile();

    const result = await moduleRef.get(HealthController).check();

    expect(result).toEqual({ status: 'ok', db: 'up' });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });
});
