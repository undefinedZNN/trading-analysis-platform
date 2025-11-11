/**
 * 数据集API服务
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export interface Dataset {
  datasetId: number;
  source?: string | null;
  tradingPair: string;
  granularity: string;
  path: string;
  timeStart: string;
  timeEnd: string;
  rowCount: number;
  checksum: string;
  labels: string[];
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DatasetListResponse {
  items: Dataset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 数据集API
 */
export class DatasetApi {
  /**
   * 获取数据集列表
   */
  static async getDatasets(params?: {
    page?: number;
    pageSize?: number;
    tradingPair?: string;
    granularity?: string;
    status?: 'active' | 'deleted' | 'all';
  }): Promise<DatasetListResponse> {
    const response = await axios.get(`${API_BASE_URL}/trading-data/datasets`, {
      params: {
        page: params?.page || 1,
        pageSize: params?.pageSize || 100,
        tradingPair: params?.tradingPair,
        granularity: params?.granularity,
        status: params?.status || 'active',
      },
    });
    return response.data;
  }

  /**
   * 获取数据集详情
   */
  static async getDataset(datasetId: number): Promise<Dataset> {
    const response = await axios.get(`${API_BASE_URL}/trading-data/datasets/${datasetId}`);
    return response.data;
  }
}

