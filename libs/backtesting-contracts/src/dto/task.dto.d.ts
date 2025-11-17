export declare enum TaskStatus {
    Pending = "pending",
    Running = "running",
    Completed = "completed",
    Failed = "failed",
    Cancelled = "cancelled"
}
export declare class TimeRangeDto {
    start: string;
    end: string;
}
export declare class TaskConfigDto {
    strategyId: string;
    datasetId: string;
    timeRange: TimeRangeDto;
    timeframe: string;
    parameters?: Record<string, unknown>;
}
export declare class ExecuteTaskDto {
    taskId: string;
    config: TaskConfigDto;
}
export declare class ExecuteTaskResponseDto {
    taskId: string;
    workerId: string;
    status: 'accepted' | 'rejected';
    acceptedAt: string;
}
export declare class TaskMetricsDto {
    throughput?: number;
    memoryUsed?: number;
    cpu?: number;
    [key: string]: unknown;
}
export declare class TaskStatusDto {
    taskId: string;
    status: TaskStatus;
    progress: number;
    metrics?: TaskMetricsDto;
    updatedAt: string;
    error?: string;
    workerId?: string;
}
export declare class TaskProgressEventDto {
    taskId: string;
    workerId: string;
    progress: number;
    processedBars: number;
    totalBars: number;
    currentTime: string;
    metrics?: TaskMetricsDto;
}
export declare class CancelTaskDto {
    taskId: string;
    reason?: string;
}
export declare class WorkerCapabilitiesDto {
    maxConcurrentTasks: number;
    supportedStrategies: string[];
}
export declare class WorkerRegistrationDto {
    workerId: string;
    host: string;
    port: number;
    capabilities: WorkerCapabilitiesDto;
}
export declare class WorkerHeartbeatDto {
    workerId: string;
    status: 'idle' | 'busy' | 'overloaded';
    currentLoad: number;
    metrics?: TaskMetricsDto;
}
export declare class WorkerDeregisterDto {
    workerId: string;
    reason?: string;
}
export declare class WorkerInfoDto extends WorkerRegistrationDto {
    status: 'idle' | 'busy' | 'down';
    lastHeartbeat: string;
}
export declare class TaskResultDto {
    taskId: string;
    workerId: string;
    summary: Record<string, unknown>;
    metrics?: TaskMetricsDto;
    artifacts?: string[];
}
