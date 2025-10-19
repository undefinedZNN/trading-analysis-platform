declare module 'parquetjs-lite' {
  import { Writable } from 'stream';

  type PrimitiveType =
    | 'BOOLEAN'
    | 'INT32'
    | 'INT64'
    | 'INT96'
    | 'FLOAT'
    | 'DOUBLE'
    | 'BYTE_ARRAY'
    | 'FIXED_LEN_BYTE_ARRAY'
    | 'UTF8'
    | 'TIMESTAMP_MILLIS'
    | 'TIMESTAMP_MICROS'
    | 'DATE'
    | 'TIME_MILLIS'
    | 'TIME_MICROS';

  interface ParquetField {
    type: PrimitiveType;
    optional?: boolean;
    compression?: 'UNCOMPRESSED' | 'GZIP' | 'SNAPPY' | 'LZO' | 'BROTLI' | 'LZ4';
    encoding?: 'PLAIN' | 'RLE' | 'PLAIN_DICTIONARY';
  }

  export class ParquetSchema {
    constructor(schema: Record<string, ParquetField>);
  }

  export class ParquetWriter<T = any> {
    static openFile<T = any>(schema: ParquetSchema, filePath: string): Promise<ParquetWriter<T>>;
    static openStream<T = any>(schema: ParquetSchema, stream: Writable): Promise<ParquetWriter<T>>;
    appendRow(row: T): Promise<void>;
    close(): Promise<void>;
  }
}
