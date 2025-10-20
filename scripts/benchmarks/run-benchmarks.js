import { performance } from 'node:perf_hooks';
import * as vm from 'node:vm';
import { VM } from 'vm2';
import ivm from 'isolated-vm';

const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS ?? '200', 10);
const LOOP_LENGTH = parseInt(process.env.BENCH_LOOP_LENGTH ?? '10000', 10);

const scriptBody = `
  const fib = (n) => (n <= 1 ? n : fib(n - 1) + fib(n - 2));
  let acc = 0;
  for (let i = 0; i < ${LOOP_LENGTH}; i++) {
    acc += fib(12);
  }
  acc;
`;

async function runVm2Bench() {
  const vm2 = new VM({
    timeout: 5000,
    sandbox: { result: 0 },
    eval: false,
    wasm: false
  });
  const start = performance.now();
  let lastResult = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    lastResult = vm2.run(scriptBody);
  }
  const duration = performance.now() - start;
  return { duration, result: lastResult };
}

async function runIsolatedVmBench() {
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();
  const script = await isolate.compileScript(scriptBody);
  const start = performance.now();
  let lastResult = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const res = await script.run(context, { timeout: 5000 });
    lastResult = res;
  }
  const duration = performance.now() - start;
  context.release();
  isolate.dispose();
  return { duration, result: lastResult };
}

async function runNativeVmBench() {
  const context = { result: 0 };
  vm.createContext(context);
  const start = performance.now();
  let lastResult = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    lastResult = vm.runInContext(scriptBody, context, { timeout: 5000 });
  }
  const duration = performance.now() - start;
  return { duration, result: lastResult };
}

async function main() {
  console.log(`Running sandbox benchmarks with ${ITERATIONS} iterations and loop length ${LOOP_LENGTH}`);
  const native = await runNativeVmBench();
  console.log(`Native vm: ${native.duration.toFixed(2)} ms (result ${native.result})`);

  const vm2 = await runVm2Bench();
  console.log(`vm2: ${vm2.duration.toFixed(2)} ms (result ${vm2.result})`);

  const isolated = await runIsolatedVmBench();
  console.log(`isolated-vm: ${isolated.duration.toFixed(2)} ms (result ${isolated.result})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
