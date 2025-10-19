import { createReadStream } from 'fs';
import { mkdtemp } from 'fs/promises';
import { createHash } from 'crypto';
import * as readline from 'readline';
import { tmpdir } from 'os';
import { join } from 'path';
import { ParquetWriter, ParquetSchema } from 'parquetjs-lite';
import {
  ImportPlugin,
  ImportContext,
  DatasetSummary,
} from './import-plugin.interface';

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

  async process(filePath: string, context: ImportContext): Promise<DatasetSummary> {
    const schema = new ParquetSchema({
      timestamp: { type: 'TIMESTAMP_MILLIS' },
      open: { type: 'DOUBLE' },
      high: { type: 'DOUBLE' },
      low: { type: 'DOUBLE' },
      close: { type: 'DOUBLE' },
      volume: { type: 'DOUBLE' },
    });

    const tempDir = await mkdtemp(join(tmpdir(), 'ohlcv_parquet_'));
    const outputPath = join(tempDir, `import_${context.task.importId}.parquet`);
    const writer = await ParquetWriter.openFile(schema, outputPath);

    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headerParsed = false;
    let rowCount = 0;
    let firstTimestamp: Date | null = null;
    let lastTimestamp: Date | null = null;
    const checksum = createHash('md5');

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;

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

        const ohlcvRow = {
          timestamp,
          open: parseFloat(row.open),
          high: parseFloat(row.high),
          low: parseFloat(row.low),
          close: parseFloat(row.close),
          volume: parseFloat(row.volume),
        };

        this.validateNumericRow(ohlcvRow);

        checksum.update(
          [
            ohlcvRow.timestamp.toISOString(),
            ohlcvRow.open.toFixed(8),
            ohlcvRow.high.toFixed(8),
            ohlcvRow.low.toFixed(8),
            ohlcvRow.close.toFixed(8),
            ohlcvRow.volume.toFixed(8),
          ].join('|') + '\n',
        );

        await writer.appendRow(ohlcvRow);

        if (!firstTimestamp) {
          firstTimestamp = timestamp;
        }
        lastTimestamp = timestamp;
        rowCount += 1;
      }
    } finally {
      await writer.close();
    }

    if (rowCount === 0 || !firstTimestamp || !lastTimestamp) {
      throw new Error('CSV 文件不包含任何数据行');
    }

    return {
      timeStart: firstTimestamp,
      timeEnd: lastTimestamp,
      rowCount,
      checksum: checksum.digest('hex'),
      outputPath,
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

  private validateNumericRow(row: {
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }) {
    if (Number.isNaN(row.open) || !Number.isFinite(row.open)) {
      throw new Error(`Invalid open value: ${row.open}`);
    }
    if (Number.isNaN(row.high) || !Number.isFinite(row.high)) {
      throw new Error(`Invalid high value: ${row.high}`);
    }
    if (Number.isNaN(row.low) || !Number.isFinite(row.low)) {
      throw new Error(`Invalid low value: ${row.low}`);
    }
    if (Number.isNaN(row.close) || !Number.isFinite(row.close)) {
      throw new Error(`Invalid close value: ${row.close}`);
    }
    if (Number.isNaN(row.volume) || !Number.isFinite(row.volume)) {
      throw new Error(`Invalid volume value: ${row.volume}`);
    }
  }
}
