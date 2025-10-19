import { ImportTaskEntity } from '../entities/import-task.entity';

export interface ImportContext {
  task: ImportTaskEntity;
}

export interface DatasetSummary {
  timeStart: Date;
  timeEnd: Date;
  rowCount: number;
  checksum: string;
  outputPath: string;
}

export interface ImportPlugin {
  readonly name: string;
  readonly supportedFormats: string[];

  supports(format: string): boolean;

  process(filePath: string, context: ImportContext): Promise<DatasetSummary>;
}
