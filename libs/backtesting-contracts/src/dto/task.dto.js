"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskResultDto = exports.WorkerInfoDto = exports.WorkerDeregisterDto = exports.WorkerHeartbeatDto = exports.WorkerRegistrationDto = exports.WorkerCapabilitiesDto = exports.CancelTaskDto = exports.TaskProgressEventDto = exports.TaskStatusDto = exports.TaskMetricsDto = exports.ExecuteTaskResponseDto = exports.ExecuteTaskDto = exports.TaskConfigDto = exports.TimeRangeDto = exports.TaskStatus = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["Pending"] = "pending";
    TaskStatus["Running"] = "running";
    TaskStatus["Completed"] = "completed";
    TaskStatus["Failed"] = "failed";
    TaskStatus["Cancelled"] = "cancelled";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
class TimeRangeDto {
}
exports.TimeRangeDto = TimeRangeDto;
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], TimeRangeDto.prototype, "start", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], TimeRangeDto.prototype, "end", void 0);
class TaskConfigDto {
}
exports.TaskConfigDto = TaskConfigDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], TaskConfigDto.prototype, "strategyId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], TaskConfigDto.prototype, "datasetId", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TimeRangeDto),
    __metadata("design:type", TimeRangeDto)
], TaskConfigDto.prototype, "timeRange", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], TaskConfigDto.prototype, "timeframe", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Object)
], TaskConfigDto.prototype, "parameters", void 0);
class ExecuteTaskDto {
}
exports.ExecuteTaskDto = ExecuteTaskDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], ExecuteTaskDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TaskConfigDto),
    __metadata("design:type", TaskConfigDto)
], ExecuteTaskDto.prototype, "config", void 0);
class ExecuteTaskResponseDto {
}
exports.ExecuteTaskResponseDto = ExecuteTaskResponseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExecuteTaskResponseDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ExecuteTaskResponseDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['accepted', 'rejected']),
    __metadata("design:type", String)
], ExecuteTaskResponseDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], ExecuteTaskResponseDto.prototype, "acceptedAt", void 0);
class TaskMetricsDto {
}
exports.TaskMetricsDto = TaskMetricsDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TaskMetricsDto.prototype, "throughput", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TaskMetricsDto.prototype, "memoryUsed", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TaskMetricsDto.prototype, "cpu", void 0);
class TaskStatusDto {
}
exports.TaskStatusDto = TaskStatusDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskStatusDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(TaskStatus),
    __metadata("design:type", String)
], TaskStatusDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], TaskStatusDto.prototype, "progress", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TaskMetricsDto),
    __metadata("design:type", TaskMetricsDto)
], TaskStatusDto.prototype, "metrics", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], TaskStatusDto.prototype, "updatedAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskStatusDto.prototype, "error", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskStatusDto.prototype, "workerId", void 0);
class TaskProgressEventDto {
}
exports.TaskProgressEventDto = TaskProgressEventDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskProgressEventDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskProgressEventDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], TaskProgressEventDto.prototype, "progress", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TaskProgressEventDto.prototype, "processedBars", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], TaskProgressEventDto.prototype, "totalBars", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], TaskProgressEventDto.prototype, "currentTime", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TaskMetricsDto),
    __metadata("design:type", TaskMetricsDto)
], TaskProgressEventDto.prototype, "metrics", void 0);
class CancelTaskDto {
}
exports.CancelTaskDto = CancelTaskDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CancelTaskDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CancelTaskDto.prototype, "reason", void 0);
class WorkerCapabilitiesDto {
}
exports.WorkerCapabilitiesDto = WorkerCapabilitiesDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], WorkerCapabilitiesDto.prototype, "maxConcurrentTasks", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], WorkerCapabilitiesDto.prototype, "supportedStrategies", void 0);
class WorkerRegistrationDto {
}
exports.WorkerRegistrationDto = WorkerRegistrationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WorkerRegistrationDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WorkerRegistrationDto.prototype, "host", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], WorkerRegistrationDto.prototype, "port", void 0);
__decorate([
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => WorkerCapabilitiesDto),
    __metadata("design:type", WorkerCapabilitiesDto)
], WorkerRegistrationDto.prototype, "capabilities", void 0);
class WorkerHeartbeatDto {
}
exports.WorkerHeartbeatDto = WorkerHeartbeatDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WorkerHeartbeatDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(['idle', 'busy', 'overloaded']),
    __metadata("design:type", String)
], WorkerHeartbeatDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], WorkerHeartbeatDto.prototype, "currentLoad", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TaskMetricsDto),
    __metadata("design:type", TaskMetricsDto)
], WorkerHeartbeatDto.prototype, "metrics", void 0);
class WorkerDeregisterDto {
}
exports.WorkerDeregisterDto = WorkerDeregisterDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WorkerDeregisterDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], WorkerDeregisterDto.prototype, "reason", void 0);
class WorkerInfoDto extends WorkerRegistrationDto {
}
exports.WorkerInfoDto = WorkerInfoDto;
__decorate([
    (0, class_validator_1.IsEnum)(['idle', 'busy', 'down']),
    __metadata("design:type", String)
], WorkerInfoDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], WorkerInfoDto.prototype, "lastHeartbeat", void 0);
class TaskResultDto {
}
exports.TaskResultDto = TaskResultDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskResultDto.prototype, "taskId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], TaskResultDto.prototype, "workerId", void 0);
__decorate([
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], TaskResultDto.prototype, "summary", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => TaskMetricsDto),
    __metadata("design:type", TaskMetricsDto)
], TaskResultDto.prototype, "metrics", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], TaskResultDto.prototype, "artifacts", void 0);
//# sourceMappingURL=task.dto.js.map