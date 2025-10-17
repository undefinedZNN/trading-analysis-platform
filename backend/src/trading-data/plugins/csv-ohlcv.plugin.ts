import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import * as readline from 'readline';
import { ImportPlugin, ImportContext, DatasetSummary } from './import-plugin.interface';

interface CsvRow {
  ts_event: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export class CsvOhlcvPlugin implements ImportPlugin {
  readonly name = 'CsvOhlcvPlugin';
  readonly supportedFormats = ['csv'];

  supports(format: string): boolean {
    return this.supportedFormats.includes(format.toLowerCase());
  }

  async process(filePath: string, _context: ImportContext): Promise<DatasetSummary> {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headerParsed = false;
    let rowCount = 0;
    let firstTimestamp: Date | null = null;
    let lastTimestamp: Date | null = null;
    const checksum = createHash('md5');

    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      checksum.update(trimmed);

      if (!headerParsed) {
        this.validateHeader(trimmed);
        headerParsed = true;
        continue;
      }

      const row = this.parseRow(trimmed);
      const timestamp = new Date(row.ts_event);
      if (Number.isNaN(timestamp.getTime())) {
        throw new Error(`Invalid timestamp: ${row.ts_event}`);
      }

      if (!firstTimestamp) {
        firstTimestamp = timestamp;
      }
      lastTimestamp = timestamp;
      rowCount += 1;
    }

    if (rowCount === 0 || !firstTimestamp || !lastTimestamp) {
      throw new Error('CSV 文件不包含任何数据行');
    }

    return {
      timeStart: firstTimestamp,
      timeEnd: lastTimestamp,
      rowCount,
      checksum: checksum.digest('hex'),
    };
  }

  private validateHeader(header: string) {
    const expected = [
      'ts_event',
      'rtype',
      'publisher_id',
      'instrument_id',
      'open',
      'high',
      'low',
      'close',
      'volume',
      'symbol',
    ];
    const columns = header.split(',').map((col) => col.trim());
    const mismatch = expected.some((item, index) => columns[index] !== item);
    if (mismatch) {
      throw new Error(`CSV 表头不符合预期，期望: ${expected.join(',')}`);
    }
  }

  private parseRow(line: string): CsvRow {
    const [
      ts_event,
      rtype,
      publisher_id,
      instrument_id,
      open,
      high,
      low,
      close,
      volume,
      symbol,
    ] = line.split(',').map((cell) => cell.trim());

    return {
      ts_event,
      open,
      high,
      low,
      close,
      volume,
    };
  }
}
