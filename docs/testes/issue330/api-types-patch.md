# Output integral local — #330

```text
[0m[32mCheck[0m ../tmp/issue330/api-final/newgang-portal/index.ts
[0m[1mTS2783 [0m[ERROR]: 'ok' is specified more than once, so this usage will be overwritten.
      if (b?.action === "wallet_sync") return json({ ok: true, ...(await walletSync()) });
[0m[31m                                                     ~~~~~~~~[0m
    at [0m[36mfile:///tmp/issue330/api-final/newgang-portal/index.ts[0m:[0m[33m452[0m:[0m[33m54[0m

[0m[1mTS2785 [0m[ERROR]:     This spread always overwrites this property.
          if (b?.action === "wallet_sync") return json({ ok: true, ...(await walletSync()) });
    [0m[31m                                                               ~~~~~~~~~~~~~~~~~~~~~~~[0m
        at [0m[36mfile:///tmp/issue330/api-final/newgang-portal/index.ts[0m:[0m[33m452[0m:[0m[33m64[0m

[0m[1m[31merror[0m: Type checking failed.

Stack backtrace:
   0: anyhow::error::<impl core::convert::From<E> for anyhow::Error>::from
   1: <core::result::Result<T,F> as core::ops::try_trait::FromResidual<core::result::Result<core::convert::Infallible,E>>>::from_residual
   2: deno::graph_container::MainModuleGraphContainer::check_specifiers::{{closure}}
   3: deno::spawn_subcommand::{{closure}}
   4: tokio::runtime::task::raw::poll
   5: deno::main
   6: std::sys::backtrace::__rust_begin_short_backtrace
   7: main
   8: __libc_start_call_main
   9: __libc_start_main@@GLIBC_2.34
  10: _start

```
