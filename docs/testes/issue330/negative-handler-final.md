# #330 — output local integral negative-handler-final

```text
[0m[38;5;245mrunning 1 test from ../tmp/issue330-final/negative/supabase/functions/newgang-portal/handler_test.ts[0m
handler missing: site/bundle/me preserve 327/328 and public cache ...
[0m[38;5;245m------- output -------[0m
newgang-portal site profile_config_unavailable
[0m[38;5;245m----- output end -----[0m
handler missing: site/bundle/me preserve 327/328 and public cache ... [0m[31mFAILED[0m [0m[38;5;245m(4ms)[0m

[0m[1m[37m[41m ERRORS [0m

handler missing: site/bundle/me preserve 327/328 and public cache [0m[38;5;245m=> ../tmp/issue330-final/negative/supabase/functions/newgang-portal/handler_test.ts:9:7[0m
[0m[1m[31merror[0m: Error: {"a":500,"b":200}
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));}
[0m[31m                                                                                ^[0m
    at [0m[1m[3meq[0m ([0m[36mfile:///tmp/issue330-final/negative/supabase/functions/newgang-portal/handler_test.ts[0m:[0m[33m4[0m:[0m[33m81[0m)
    at [0m[36mfile:///tmp/issue330-final/negative/supabase/functions/newgang-portal/handler_test.ts[0m:[0m[33m11[0m:[0m[33m69[0m

[0m[1m[37m[41m FAILURES [0m

handler missing: site/bundle/me preserve 327/328 and public cache [0m[38;5;245m=> ../tmp/issue330-final/negative/supabase/functions/newgang-portal/handler_test.ts:9:7[0m

[0m[31mFAILED[0m | 0 passed | 1 failed | 7 filtered out [0m[38;5;245m(7ms)[0m

[0m[1m[31merror[0m: Test failed

Stack backtrace:
   0: anyhow::error::<impl anyhow::Error>::msg
   1: deno::tools::test::report_tests::{{closure}}
   2: <deno_unsync::tokio::task::MaskFutureAsSend<F> as core::future::future::Future>::poll
   3: tokio::runtime::task::raw::poll
   4: deno::main
   5: std::sys::backtrace::__rust_begin_short_backtrace
   6: main
   7: __libc_start_call_main
   8: __libc_start_main@@GLIBC_2.34
   9: _start

```
