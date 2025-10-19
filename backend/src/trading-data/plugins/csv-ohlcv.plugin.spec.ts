import { join, dirname } from 'path';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { CsvOhlcvPlugin } from './csv-ohlcv.plugin';

describe('CsvOhlcvPlugin', () => {
  const plugin = new CsvOhlcvPlugin();

  it('should parse csv file and produce summary', async () => {
    const filePath = join(tmpdir(), `test_csv_${Date.now()}.csv`);
    writeFileSync(
      filePath,
      'ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol\n' +
        '2022-12-15T00:00:00.000000000Z,32,1,206299,4037.75,4037.75,4037.5,4037.5,19,ESH3\n' +
        '2022-12-15T00:00:01.000000000Z,32,1,206299,4037.5,4037.5,4037.5,4037.5,2,ESH3\n',
    );

    const summary = await plugin.process(filePath, {
      task: {
        importId: 1,
      } as any,
    });

    expect(summary.rowCount).toBe(2);
    expect(summary.timeStart.toISOString()).toBe('2022-12-15T00:00:00.000Z');
    expect(summary.timeEnd.toISOString()).toBe('2022-12-15T00:00:01.000Z');
    expect(summary.checksum).toHaveLength(32);
    expect(summary.outputPath.endsWith('.parquet')).toBe(true);
    expect(existsSync(summary.outputPath)).toBe(true);

    rmSync(filePath, { force: true });
    rmSync(dirname(summary.outputPath), { recursive: true, force: true });
  });

  it('should throw when header invalid', async () => {
    const filePath = join(tmpdir(), `test_csv_invalid_${Date.now()}.csv`);
    writeFileSync(filePath, 'foo,bar\n1,2\n');

    await expect(
      plugin.process(filePath, { task: { importId: 1 } as any }),
    ).rejects.toThrow('CSV 表头不符合预期');

    rmSync(filePath, { force: true });
  });
});
