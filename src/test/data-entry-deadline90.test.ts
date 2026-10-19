import {afterEach,expect,it,vi} from "vitest";
import {boundedAnalysis,ANALYSIS_TIMEOUT_MS} from "../../supabase/functions/data-entry/analysis-deadline";
afterEach(()=>vi.useRealTimers());
it("90 server deadline aborts at exactly60000ms, not before",async()=>{
 vi.useFakeTimers();expect(ANALYSIS_TIMEOUT_MS).toBe(60000);
 const caller=new AbortController();let signal:AbortSignal|undefined;
 const pending=boundedAnalysis(caller.signal,s=>{signal=s;return new Promise<void>(resolve=>s.addEventListener("abort",()=>resolve(),{once:true}));});
 await vi.advanceTimersByTimeAsync(59999);expect(signal?.aborted).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(signal?.aborted).toBe(true);await pending;expect(vi.getTimerCount()).toBe(0);
});
it("90 Stop and already-aborted caller propagate; successful completion removes deadline",async()=>{
 vi.useFakeTimers();const caller=new AbortController();
 const pending=boundedAnalysis(caller.signal,s=>new Promise<boolean>(resolve=>s.addEventListener("abort",()=>resolve(s.aborted),{once:true})));
 caller.abort();expect(await pending).toBe(true);expect(vi.getTimerCount()).toBe(0);
 expect(await boundedAnalysis(caller.signal,async s=>s.aborted)).toBe(true);
 expect(await boundedAnalysis(new AbortController().signal,async s=>!s.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
});