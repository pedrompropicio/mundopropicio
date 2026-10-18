# Outputs crus #333 — prova32

## head-integration
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.head.config.ts --reporter=default --reporter=json --outputFile=/tmp/issue333-head-29p36gir/head-results.json

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-29p36gir/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mPAGE success []
PASS React Assistant upload/fields/preview/authorization/check/link
PAGE lost-authorize []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/data-entry
PASS lost CORE authorize => read-only check, no success/resend
PAGE context-authorize-company []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending authorize company invalidates stale response; no next effect
PAGE context-authorize-auth []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending authorize auth invalidates stale response; no next effect
PAGE lost-begin []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/data-entry
PASS lost CORE begin => read-only check, no success/resend
PAGE context-begin-company []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending begin company invalidates stale response; no next effect
PAGE context-begin-auth []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending begin auth invalidates stale response; no next effect
PASS actual React scanner capture/manual/save -> checked SQL
PASS React accountant editor metadata -> SQL/audit/unchanged bytes
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
PASS lost confirmation/company change -> owner discovery/read-only linkage -> visible bound envelope/original bytes -> explicit reserved execution once
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
PASS pending confirmation Auth invalidates stale result; one prepared destination, no execution/reconfirm


 [32m✓[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m)[22m[33m 49879[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 747[2mms[22m[39m
   [33m[2m✓[22m[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice [33m 317[2mms[22m[39m
   [33m[2m✓[22m[39m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer [33m 345[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 1885[2mms[22m[39m
   [33m[2m✓[22m[39m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof [33m 374[2mms[22m[39m
   [33m[2m✓[22m[39m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery [33m 41658[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m26 passed[39m[22m[90m (26)[39m
[2m   Start at [22m 00:34:05
[2m   Duration [22m 53.37s[2m (transform 928ms, setup 137ms, collect 1.77s, tests 49.88s, environment 725ms, prepare 458ms)[22m

JSON report written to /tmp/issue333-head-29p36gir/head-results.json
[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mreal DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: An update to AccountantStandaloneInvoicesTab inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mactual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[22m[39mWarning: An update to Select inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to Select inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
Warning: An update to SelectItemText inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:901:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:39:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:800:7
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:158:56
    at div
    at file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:711:13
    at div
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mBrowserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme

[90mstderr[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mError: [31m  Failed to scan for dependencies from entries:
  /tmp/issue333-head-29p36gir/tree/index.html

  [39m[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "AuthProvider"[0m

    src/App.tsx:20:9:
[37m      20 │ import { [32mAuthProvider[37m, useAuth } from "@/contexts/AuthContext";
         ╵          [32m~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/AccountAccessModal.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/AccountBalanceImplantModal.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/AdoptForecastsModal.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/BPGridEditor.tsx:32:9:
[37m      32 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/BPNotesAttachmentsModal.tsx:22:9:
[37m      22 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/BatchPaymentModal.tsx:16:9:
[37m      16 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CacheExtrasPanel.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CacheSettlementPanel.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CacheTransactionModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/ChangePasswordModal.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CoalaImportWizard.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CompanyBudgetModeCard.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CompanyFeaturesPanel.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "useUserMemberships"[0m

    src/components/CompanySwitcher.tsx:23:2:
[37m      23 │   [32museUserMemberships[37m,
         ╵   [32m~~~~~~~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "useSetActiveCompany"[0m

    src/components/CompanySwitcher.tsx:24:2:
[37m      24 │   [32museSetActiveCompany[37m,
         ╵   [32m~~~~~~~~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "useCompaniesList"[0m

    src/components/CompanySwitcher.tsx:25:2:
[37m      25 │   [32museCompaniesList[37m,
         ╵   [32m~~~~~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "useProfileActiveCompanyId"[0m

    src/components/CompanySwitcher.tsx:26:2:
[37m      26 │   [32museProfileActiveCompanyId[37m,
         ╵   [32m~~~~~~~~~~~~~~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/CopyPLModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EntityDocumentsSection.tsx:38:9:
[37m      38 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventABAttachmentsSection.tsx:30:9:
[37m      30 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventCacheConfig.tsx:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventClosingCosts.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventEditModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventForecast.tsx:37:9:
[37m      37 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventPartnersTab.tsx:29:9:
[37m      29 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventRealizedAllocation.tsx:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventSessionsManager.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventSettlementsManager.tsx:25:9:
[37m      25 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/EventTicketing.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/FinancialOperationsTab.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/ForecastEditModal.tsx:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/InvoiceGroupAction.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/InvoiceGroupRevalidateDialog.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/InvoiceGroupSuggestDialog.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/LinkBpLineDialog.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/LinkReimbursementNoteModal.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/MarkInstallmentPaidModal.tsx:16:9:
[37m      16 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/MfaEnroll.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/MfaVerify.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/OrphanAttachmentsResolver.tsx:27:9:
[37m      27 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/OrphanTransactionsModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PartnerAccessManager.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PartnerCapitalPanel.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PartnerExtrasPanel.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PartnerPaidExpensesPanel.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PartnerSettlementTab.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PaymentListReceipts.tsx:21:9:
[37m      21 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PaymentListsTab.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PaymentTimeline.tsx:21:9:
[37m      21 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/PushNotificationToggle.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/RaiseBudgetDialog.tsx:18:9:
[37m      18 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/ReimbursementNoteDetail.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/ReimbursementNoteFormModal.tsx:11:9:
[37m      11 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SelectiveRestoreModal.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SepaExportModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SettlementSealControl.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SplitByBpLinesModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SplitByIvaModal.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/SupplierTransactions.tsx:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TicketForecastImportModal.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TicketOfficeTicketingTab.tsx:18:9:
[37m      18 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TicketUploadModals.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionDocumentsModal.tsx:11:9:
[37m      11 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionEditModal.tsx:21:9:
[37m      21 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionFormModal.tsx:20:9:
[37m      20 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionInstallmentGroupEditor.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionPaymentModal.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionPaymentsListModal.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionRenegotiateInstallmentsModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransactionRow.tsx:20:9:
[37m      20 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/TransferFormModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "ALL_PERMISSIONS"[0m

    src/components/UserPermissionsModal.tsx:4:23:
[37m      4 │ import { type AppRole, [32mALL_PERMISSIONS[37m } from "@/contexts/AuthConte...
        ╵                        [32m~~~~~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/UserPermissionsModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bank/BankLineDocumentsDialog.tsx:26:9:
[37m      26 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp-versions/ActiveVersionDiffModal.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp-versions/BulkFormalidadePopover.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp-versions/FormalidadeBadge.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp-versions/MarkAsFechadoDialog.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp/OrderingPartnerBadge.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/bp/PayingPartnerBadge.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/CamarimFundMoveModal.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/CamarimItemAttachmentButton.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/CamarimItemModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/EditSessionModal.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/FundHolderPicker.tsx:15:9:
[37m      15 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/OpenSessionModal.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/camarim/SplitItemModal.tsx:4:9:
[37m      4 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/ApproveCardItemModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/CardItemDocumentsField.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/CardLoadModal.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/CardTeamItemModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/CloseCardSessionModal.tsx:19:9:
[37m      19 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/NewCardExpenseModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/cards/OpenCardSessionModal.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/EditEtapaSheet.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/EtapaAssigneeSheet.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/NewEtapaDialog.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/NewFrenteDialog.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/NewStaffDialog.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/RegistroSheet.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/desktop/EtapasTable.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/desktop/FrenteTeamEditor.tsx:11:9:
[37m      11 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/equipa/FieldStaffSection.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/equipa/FrenteAssociationPicker.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/equipa/NewProducerDialog.tsx:15:9:
[37m      15 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/equipa/PessoaSheet.tsx:26:9:
[37m      26 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/event/EditFrenteSheet.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/event/EventTeamSection.tsx:20:9:
[37m      20 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/event/EventoPhase.tsx:21:9:
[37m      21 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/event/FrentesPanel.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/reports/OperationalReportDialog.tsx:16:9:
[37m      16 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "ROLE_LABELS"[0m

    src/components/operacao/shared/NewProfileInlineDialog.tsx:4:23:
[37m      4 │ import { type AppRole, [32mROLE_LABELS[37m } from "@/contexts/AuthContext";
        ╵                        [32m~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/shared/NewProfileInlineDialog.tsx:11:9:
[37m      11 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/suppliers/AddSupplierToEtapaDialog.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/suppliers/EditEtapaSupplierDialog.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/operacao/suppliers/EtapaSuppliersPanel.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/simulator/ExecutiveDashboard.tsx:20:9:
[37m      20 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/components/sponsorship/SponsorshipPipelineImportModal.tsx:26:9:
[37m      26 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useEventCostBasis.ts:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useInactivityTimeout.ts:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useSponsorshipPipeline.ts:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useSponsorshipSegments.ts:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useSyncCacheForecasts.ts:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useSyncFormulaForecasts.ts:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/hooks/useUndoToast.tsx:2:9:
[37m      2 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/AcceptInvitation.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/Auth.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/CamarimSessionDetail.tsx:11:9:
[37m      11 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/CardSessionDetail.tsx:8:9:
[37m      8 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/DatabaseBackups.tsx:6:9:
[37m      6 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/EventDetail.tsx:75:9:
[37m      75 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/EventSimulator.tsx:30:9:
[37m      30 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/Events.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/FinancialAccounts.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/FormalidadeAudit.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/Reimbursements.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/ResetPassword.tsx:3:9:
[37m      3 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/SalesBIEvent.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/SecurityDashboard.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/Transactions.tsx:13:9:
[37m      13 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/Trash.tsx:10:9:
[37m      10 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "ROLE_LABELS"[0m

    src/pages/UserManagement.tsx:4:32:
[37m      4 │ ...t { useAuth, type AppRole, [32mROLE_LABELS[37m, ROLE_COLORS } from "@/co...
        ╵                               [32m~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "ROLE_COLORS"[0m

    src/pages/UserManagement.tsx:4:45:
[37m      4 │ ...type AppRole, ROLE_LABELS, [32mROLE_COLORS[37m } from "@/contexts/AuthCo...
        ╵                               [32m~~~~~~~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/UserManagement.tsx:5:9:
[37m      5 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/admin/Companies.tsx:21:9:
[37m      21 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/admin/InvoiceGroupAudit.tsx:9:9:
[37m      9 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/admin/ManualSync.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/admin/Reminders.tsx:12:9:
[37m      12 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/admin/RlsLegacyAudit.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/operacao/ChamadoDetail.tsx:19:9:
[37m      19 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/operacao/ChamadoNovo.tsx:14:9:
[37m      14 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/operacao/EtapaDetail.tsx:24:9:
[37m      24 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/operacao/EventHub.tsx:17:9:
[37m      17 │ import { [32mtoast[37m } from "@/hooks/use-toast";
         ╵          [32m~~~~~[0m


[31m✘ [41;31m[[41;97mERROR[41;31m][0m [1mNo matching export in "docs/testes/issue333/head/react-boundary.tsx" for import "toast"[0m

    src/pages/operacao/FrenteManage.tsx:7:9:
[37m      7 │ import { [32mtoast[37m } from "@/hooks/use-toast";
        ╵          [32m~~~~~[0m


    at failureErrorWithLog (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:1472:15)
    at /dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:945:25
    at runOnEndCallbacks (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:1315:45)
    at buildResponseToResult (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:943:7)
    at /dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:955:9
    at new Promise (<anonymous>)
    at requestCallbacks.on-end (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:954:54)
    at handleRequest (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:647:17)
    at handleIncomingPacket (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:672:7)
    at Socket.readFromStdout (/dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:600:7)
    at Socket.emit (node:events:519:28)
    at addChunk (node:internal/streams/readable:561:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:512:3)
    at Socket.Readable.push (node:internal/streams/readable:392:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)


EXIT: 0

```

## react-chromium
```text
PAGE success []
PASS React Assistant upload/fields/preview/authorization/check/link
PAGE lost-authorize []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/data-entry
PASS lost CORE authorize => read-only check, no success/resend
PAGE context-authorize-company []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending authorize company invalidates stale response; no next effect
PAGE context-authorize-auth []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending authorize auth invalidates stale response; no next effect
PAGE lost-begin []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/data-entry
PASS lost CORE begin => read-only check, no success/resend
PAGE context-begin-company []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending begin company invalidates stale response; no next effect
PAGE context-begin-auth []
HTTPERROR 503 http://127.0.0.1:26205/functions/v1/data-entry
PASS pending begin auth invalidates stale response; no next effect
PASS actual React scanner capture/manual/save -> checked SQL
PASS React accountant editor metadata -> SQL/audit/unchanged bytes
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
PASS lost confirmation/company change -> owner discovery/read-only linkage -> visible bound envelope/original bytes -> explicit reserved execution once
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
HTTPERROR 409 http://127.0.0.1:26205/functions/v1/standalone-attempt-333
PASS pending confirmation Auth invalidates stale result; one prepared destination, no execution/reconfirm

```

## ui-client
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vitest/vitest.mjs run src/components/data-entry/__tests__/DataEntryDialog.test.tsx src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx src/lib/__tests__/standalone-attempt-routing.test.ts src/lib/__tests__/standalone-capabilities.test.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-29p36gir/tree[39m

 [32m✓[39m src/lib/__tests__/standalone-attempt-routing.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capabilities.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 721[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 4199[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 504[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 341[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 408[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 446[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 439[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após company não mostra sucesso e retoma só confere [33m 418[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de upload após contexto alterado é descartada [33m 393[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de preview após contexto alterado é descartada [33m 382[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mutilizador diferente não recebe retoma; contexto revalidado antes de execução [33m 397[2mms[22m[39m

[2m Test Files [22m [1m[32m4 passed[39m[22m[90m (4)[39m
[2m      Tests [22m [1m[32m44 passed[39m[22m[90m (44)[39m
[2m   Start at [22m 00:34:59
[2m   Duration [22m 10.42s[2m (transform 1.24s, setup 1.71s, collect 3.74s, tests 4.98s, environment 8.83s, prepare 3.71s)[22m

[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.


EXIT: 0

```

## pg-attempts
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vitest/vitest.mjs run --config head.pg.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-29p36gir/tree[39m

 [32m✓[39m docs/testes/issue333/pg/attempts-pg.test.ts [2m([22m[2m31 tests[22m[2m)[22m[33m 5021[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m31 passed[39m[22m[90m (31)[39m
[2m   Start at [22m 00:35:11
[2m   Duration [22m 6.04s[2m (transform 155ms, setup 0ms, collect 187ms, tests 5.02s, environment 0ms, prepare 386ms)[22m


EXIT: 0

```

## entry-chromium
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vitest/vitest.mjs run --config docs/testes/issue333/vitest.entry.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-29p36gir/tree[39m

 [32m✓[39m docs/testes/issue333/integrated/attempt-entry.test.ts [2m([22m[2m7 tests[22m[2m)[22m[33m 2532[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium cross-origin fetch performs actual OPTIONS then POST using candidate entry headers [33m 2364[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 00:35:18
[2m   Duration [22m 4.26s[2m (transform 225ms, setup 0ms, collect 147ms, tests 2.53s, environment 0ms, prepare 783ms)[22m


EXIT: 0

```

## general
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vitest/vitest.mjs run --config vitest.offline.config.ts

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-29p36gir/tree[39m

 [32m✓[39m src/test/newgang-wallet-google.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 234[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-row-limit.test.ts [2m([22m[2m2 tests[22m[2m)[22m[33m 440[2mms[22m[39m
   [33m[2m✓[22m[39m barreira dos 1.000 registos do PostgREST[2m > [22m[Issue #289] nenhuma leitura de tabela grande sem paginação [33m 431[2mms[22m[39m
 [32m✓[39m src/test/campaign-design-optional-roas.test.ts [2m([22m[2m15 tests[22m[2m)[22m[33m 371[2mms[22m[39m
 [32m✓[39m src/test/forecast-attachment-counts.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 471[2mms[22m[39m
   [33m[2m✓[22m[39m anexos do BP — uma leitura por evento (#269)[2m > [22m361 linhas → 1 pedido a event_forecast_attachments [33m 469[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/storage-multi-tenant.test.ts [2m([22m[2m14 tests[22m[2m)[22m[33m 985[2mms[22m[39m
   [33m[2m✓[22m[39m multi-tenant storage helpers[2m > [22museSetActiveCompany limpa a cache do storage[2m > [22mdepois da troca, withCompanyPath prefixa com a empresa nova [33m 955[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneReservedExecution.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 445[2mms[22m[39m
 [32m✓[39m src/components/standalone/__tests__/StandaloneAttemptsPanel.test.tsx [2m([22m[2m9 tests[22m[2m)[22m[33m 949[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/document-detect.test.ts [2m([22m[2m5 tests[22m[2m)[22m[33m 2145[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 12°, centrado com erro < 3% [33m 694[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado -18°, à esquerda com erro < 3% [33m 369[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 20°, canto sup. dir. com erro < 3% [33m 387[2mms[22m[39m
   [33m[2m✓[22m[39m detectDocumentQuad[2m > [22mdeteta A4 rodado 6°, grande com erro < 3% [33m 452[2mms[22m[39m
 [32m✓[39m src/components/__tests__/LinkBpLineDialog-layer.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 311[2mms[22m[39m
   [33m[2m✓[22m[39m #249 Vincular ao BP above Editar Transação[2m > [22mmounts above the existing transaction overlay and receives focus [33m 309[2mms[22m[39m
 [32m✓[39m src/test/mobile-modal-dismiss.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 544[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overlay-layer.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[33m 778[2mms[22m[39m
   [33m[2m✓[22m[39m pilha de camadas — aninhamentos reais[2m > [22m#260 classificação acima da Nova Transação recebe foco e confirma escolha [33m 527[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventABTab.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[33m 549[2mms[22m[39m
   [33m[2m✓[22m[39m EventABTab — UI smoke tests[2m > [22mrenderiza sem crashar e mostra labels/inputs das zonas [33m 345[2mms[22m[39m
 [32m✓[39m src/test/club-config-integration.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[33m 950[2mms[22m[39m
   [33m[2m✓[22m[39m #327 integration without network[2m > [22mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa [33m 447[2mms[22m[39m
 [32m✓[39m src/test/event-financial-card-render-loop.test.tsx [2m([22m[2m1 test[22m[2m)[22m[33m 1131[2mms[22m[39m
   [33m[2m✓[22m[39m EventFinancialCard — sem ciclo de redesenho (#269)[2m > [22mchama onEbitdaParcelsChange uma única vez com queries vazias [33m 1129[2mms[22m[39m
 [32m✓[39m src/components/data-entry/__tests__/DataEntryDialog.test.tsx [2m([22m[2m13 tests[22m[2m)[22m[33m 4425[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução não validada: prévia visível, botão desativado mesmo após confirmação [33m 629[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução validada: exige confirmação explícita e mostra a conferência com a observação [33m 517[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22meditar depois da prévia exige nova prévia/hash antes de executar [33m 375[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mretoma nunca declara sucesso por cache; repõe campos, lê check, sem commit [33m 380[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após close não mostra sucesso e retoma só confere [33m 367[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mexecução tardia após company não mostra sucesso e retoma só confere [33m 386[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de upload após contexto alterado é descartada [33m 484[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mresposta tardia de preview após contexto alterado é descartada [33m 440[2mms[22m[39m
   [33m[2m✓[22m[39m #333 DataEntryDialog[2m > [22mutilizador diferente não recebe retoma; contexto revalidado antes de execução [33m 348[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-embeds.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 259[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/no-direct-transaction-document-remove.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 187[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-handler.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 236[2mms[22m[39m
 [32m✓[39m src/pages/__tests__/ResetPassword.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[33m 334[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-f2b.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 240[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-percentage.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 128[2mms[22m[39m
 [32m✓[39m src/components/__tests__/StatCard.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 94[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/multi-day-ticketing.test.ts [2m([22m[2m25 tests[22m[2m | [22m[33m4 skipped[39m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/require-feature.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 165[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-statement-documents.test.tsx [2m([22m[2m6 tests[22m[2m)[22m[32m 205[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-report.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 44[2mms[22m[39m
 [32m✓[39m src/test/newgang-content.test.tsx [2m([22m[2m2 tests[22m[2m)[22m[32m 95[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-pdf.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 79[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-properties.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 77[2mms[22m[39m
 [32m✓[39m src/components/__tests__/EventStatusBadge.test.tsx [2m([22m[2m5 tests[22m[2m)[22m[32m 67[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-statement-doc.test.ts [2m([22m[2m29 tests[22m[2m)[22m[32m 120[2mms[22m[39m
 [32m✓[39m src/test/edge-fn-guard.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 114[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-view.test.tsx [2m([22m[2m3 tests[22m[2m)[22m[32m 121[2mms[22m[39m
 [32m✓[39m src/test/camarim-session-pdf-sanitize.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/postgrest-large-tables-mirror.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-scope.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 218[2mms[22m[39m
 [32m✓[39m src/test/consent-contract-322.test.ts [2m([22m[2m38 tests[22m[2m)[22m[32m 65[2mms[22m[39m
 [32m✓[39m src/test/crm-audience-live-count.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/similar-suppliers-notice.test.tsx [2m([22m[2m4 tests[22m[2m)[22m[32m 85[2mms[22m[39m
 [32m✓[39m src/test/check-deploy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-card-date.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 114[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-turns.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/test/song-link-ssr.test.ts [2m([22m[2m24 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/test/approve-lock-and-core.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m src/test/newgang-welcome-once.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 35[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/google-click-match.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tickets-v2-read-layer.test.ts [2m([22m[2m28 tests[22m[2m | [22m[33m7 skipped[39m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capabilities.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/test/standalone-compat-prepared.test.ts [2m([22m[2m26 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/test/event-financials-invalidation.test.tsx [2m([22m[2m8 tests[22m[2m)[22m[32m 54[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-version-multi-diff.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 26[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/validations.test.ts [2m([22m[2m17 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-formula.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/components/TicketOfficePositionCards.test.tsx [2m([22m[2m7 tests[22m[2m)[22m[32m 45[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/supplier-credits.test.ts [2m([22m[2m34 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-settlement-engine.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/overhead-proration.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-participants.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-undo.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/statement-grouping.test.ts [2m([22m[2m16 tests[22m[2m)[22m[32m 42[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/help-manual-parser.test.ts [2m([22m[2m10 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-capacity.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m src/lib/cost-center-map.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 82[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/data-entry-contract.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 63[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-partner-mirror.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-invoices.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-tx-matching.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/coala-meta-audience-sync.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-cash-preview.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/test/transaction-duplicate-check.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-attempt-routing.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 51[2mms[22m[39m
 [32m✓[39m src/test/newgang-missions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 28[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/utils.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-reconciliation.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-calc.test.ts [2m([22m[2m35 tests[22m[2m)[22m[32m 71[2mms[22m[39m
 [32m✓[39m src/test/newgang-profile-country.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 61[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/simulator-prior-curve.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/components/__tests__/PasswordStrengthIndicator.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-photos.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-boost.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/test/newgang-wallet-levels.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/test/derp248-tiktok-event-trackers.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ads-tour-split.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 30[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/account-balance-settling.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/newgang-edition-videos.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/dre-nature-divergence.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-full-suite.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 38[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/tour-cache-sync.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-revenue.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 31[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-integrate.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/newgang-strict-audience-delivery.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 59[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/transitory-transactions.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 40[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/standalone-capability-proposal.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 37[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/split-adjustment.test.ts [2m([22m[2m37 tests[22m[2m)[22m[32m 22[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-seal.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 12[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-review.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/refund-grouping.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-settlement-calc.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/test/bol-m2-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 50[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-per-company.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/silent-writes.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 20[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/payment-settlement.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 18[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-calc.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 21[2mms[22m[39m
 [32m✓[39m src/test/memory-index.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/iva.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 49[2mms[22m[39m
 [32m✓[39m src/lib/sepa/bank-execution.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/newgang-portal-bundle.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/club-config-source.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 36[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-settlement-internal-report.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/test/ticketline-import-format-transition.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/test/bol-daily-parser.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 24[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ebitda.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/camarim-bp-rules.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 33[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-union-148.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/income-tax-out-of-event-result.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-revenue-basis.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/capi-p1-guard.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 23[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/combo-gating.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/contactos-list-paging.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/test/crm-ingest-no-network.test.ts [2m([22m[2m12 tests[22m[2m)[22m[32m 9[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/cache-tab-total.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 17[2mms[22m[39m
 [32m✓[39m src/test/capi-diag-no-secrets.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/real-cache-deductions.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 15[2mms[22m[39m
[90mstdout[2m | src/lib/__tests__/card-session-theoretical.test.ts[2m > [22m[2m#275 saldo teórico da sessão = fecho[2m > [22m[2msem override e com transação carimbada anterior à abertura: teórico = saldo da conta − itens por integrar
[22m[39m[#275] teórico = 636.68 esperado = 636.68

 [32m✓[39m src/lib/__tests__/card-session-theoretical.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-capacities.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis-tour.test.ts [2m([22m[2m13 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-disbursement.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/report-event-cost.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/test/transaction-edit-modal-operation-key.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 14[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/master-adopted-expense-proration.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-nature.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/test/newgang-history.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m src/test/operation-key-domain.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 19[2mms[22m[39m
 [32m✓[39m src/test/payment-method-domain.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 34[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-perimeter.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 13[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/pl-category-matching.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 32[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-effective-open.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 29[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/creative-media.test.ts [2m([22m[2m19 tests[22m[2m)[22m[32m 43[2mms[22m[39m
 [32m✓[39m src/components/__tests__/bp-installments.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 70[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 16[2mms[22m[39m
 [32m✓[39m src/test/newgang-crews.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/test/supplier-similarity.test.ts [2m([22m[2m11 tests[22m[2m)[22m[32m 11[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-office-position.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-line-required.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/session-copy.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/coala-centro-custo-norm.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/accountant-account-filter.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-price-elasticity.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 10[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-cost-basis.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-revenue-single-rule.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-realized.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/ticket-office-settlement-eligible.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-simulator-ab-scale.test.ts [2m([22m[2m8 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/fecho-preconditions.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-rebill-vat.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/settlement-doc-text.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/crm/creativeReelsCheck.test.ts [2m([22m[2m5 tests[22m[2m)[22m[32m 7[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/partner-extras-kind.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/event-ab-rounding.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/partner-statement-cards.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/bp-planilha-version.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/forecast-edit-diff.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/ticket-category.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/permissions-guards-proof.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 5[2mms[22m[39m
 [32m✓[39m src/test/example.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 8[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/zone-on-sale.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m src/lib/__tests__/audit.test.ts [2m([22m[2m4 tests[22m[2m)[22m[32m 3[2mms[22m[39m
 [2m[90m↓[39m[22m src/test/partner-statement-edge.test.ts [2m([22m[2m1 test[22m[2m | [22m[33m1 skipped[39m[2m)[22m
 [32m✓[39m src/test/payment-list-revalidate.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 6[2mms[22m[39m
 [32m✓[39m src/test/format-integer-conversions.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 3[2mms[22m[39m

[2m Test Files [22m [1m[32m170 passed[39m[22m[2m | [22m[33m1 skipped[39m[90m (171)[39m
[2m      Tests [22m [1m[32m1377 passed[39m[22m[2m | [22m[33m1 skipped[39m[2m | [22m[90m11 todo[39m[90m (1389)[39m
[2m   Start at [22m 00:35:23
[2m   Duration [22m 113.82s[2m (transform 18.32s, setup 213.41s, collect 168.09s, tests 20.89s, environment 952.60s, prepare 167.39s)[22m

[90mstderr[2m | src/components/data-entry/__tests__/DataEntryDialog.test.tsx[2m > [22m[2m#333 DataEntryDialog[2m > [22m[2mendpoint ausente: mostra indisponível e não oferece ações
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mEsc não fecha o modal sob outra janela
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/test/mobile-modal-dismiss.test.tsx[2m > [22m[2mFecho de modais no telemóvel[2m > [22m[2mDialog separa cabeçalho e corpo e mantém o X fora do scroll
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mDialog dentro de overlay manual fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mAlertDialog dentro de Dialog fica por cima
[22m[39mWarning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/lib/__tests__/overlay-layer.test.tsx[2m > [22m[2mpilha de camadas — aninhamentos reais[2m > [22m[2mSelect dentro de AlertDialog dentro de overlay manual fica por cima de tudo
[22m[39m`AlertDialogContent` requires a description for the component to be accessible for screen reader users.

You can add a description to the `AlertDialogContent` by passing a `AlertDialogDescription` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an `id` and passing the same value to the `aria-describedby` prop in `AlertDialogContent`. If the description is confusing or duplicative for sighted users, you can use the `@radix-ui/react-visually-hidden` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog
Warning: Missing `Description` or `aria-describedby={undefined}` for {AlertDialogContent}.

[90mstderr[2m | src/test/club-config-integration.test.tsx[2m > [22m[2m#327 integration without network[2m > [22m[2mdraft/sem ativa guarda 200; após ativação mostra 100 e grava só limites/ativa
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/components/__tests__/EventABTab.test.tsx[2m > [22m[2mEventABTab — UI smoke tests[2m > [22m[2mrenderiza sem crashar e mostra labels/inputs das zonas
[22m[39mWarning: Input contains an input of type undefined with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://reactjs.org/link/controlled-components
    at input
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/input.tsx:8:6
    at div
    at div
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/card.tsx:38:6
    at div
    at /tmp/issue333-head-29p36gir/tree/src/components/ui/card.tsx:7:50
    at div
    at EventABTab (/tmp/issue333-head-29p36gir/tree/src/components/EventABTab.tsx:151:23)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)
    at Router (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1207:17)
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)
⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/pages/__tests__/ResetPassword.test.tsx[2m > [22m[2mResetPassword — token_hash flow[2m > [22m[2m(a) não chama verifyOtp ao montar; só ao clicar Continuar
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/lib/__tests__/permissions-guards-f2b.test.tsx[2m > [22m[2m#311 F2b — guardas por permissão[2m > [22m[2mmanager com excepção module.crm entra em /crm e vê o cartão CRM activo
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/require-feature.test.tsx[2m > [22m[2mvisibilidade por company_features[2m > [22m[2mrota bloqueada sem a chave
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/lib/__tests__/cache-scope.test.tsx[2m > [22m[2mecrã do subevento usa a configuração do Master[2m > [22m[2mmostra 'Cachê configurado no Master' e calcula pelo Master com as cidades irmãs
[22m[39m⚠️ React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7. You can use the `v7_startTransition` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_starttransition.
⚠️ React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7. You can use the `v7_relativeSplatPath` future flag to opt-in early. For more information, see https://reactrouter.com/v6/upgrading/future#v7_relativesplatpath.

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mconsent: timeout da RPC → 503 bloqueado
[22m[39m[portal-track] consent rpc threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2mbind falha (throw): lead entra sem ids Meta
[22m[39m[portal-track] consent bind threw Error: timeout

[90mstderr[2m | src/test/consent-contract-322.test.ts[2m > [22m[2mportal-track handler[2m > [22m[2minsert falha → 500 (sem falso sucesso)
[22m[39m[portal-track] insert lead_capture [33m500[39m

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: 0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2momite observação abaixo de um cêntimo: -0.009
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -0.01
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: 265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)

[90mstderr[2m | src/components/TicketOfficePositionCards.test.tsx[2m > [22m[2mTicketOfficePositionCards — observação condicional[2m > [22m[2mpreserva observação a partir de um cêntimo: -265
[22m[39mWarning: useLayoutEffect does nothing on the server, because its effect cannot be encoded into the server renderer's output format. This will lead to a mismatch between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect should only be used in components that render exclusively on the client. See https://reactjs.org/link/uselayouteffect-ssr for common fixes.
    at MemoryRouter (/dev-server/node_modules/react-router/dist/umd/react-router.development.js:1101:7)


EXIT: 0

```

## tsgo
```text
COMMAND: /node_modules/.bin/tsgo -p tsconfig.app.json --noEmit

EXIT: 0

```

## deno
```text
COMMAND: /bin/deno check --no-remote --config deno-isolated.json supabase/functions/data-entry/handler.ts supabase/functions/standalone-attempt-333/index.ts supabase/functions/ingest-standalone-invoice/index.ts
[0m[32mCheck[0m supabase/functions/data-entry/handler.ts
[0m[32mCheck[0m supabase/functions/standalone-attempt-333/index.ts
[0m[32mCheck[0m supabase/functions/ingest-standalone-invoice/index.ts

EXIT: 0

```

## build
```text
COMMAND: node /tmp/issue333-head-29p36gir/tree/node_modules/vite/bin/vite.js build
[36mvite v5.4.19 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 6222 modules transformed.
rendering chunks...
[bundle] inicial estático: 5140554 bytes
computing gzip size...
[2mdist/[22m[32mmanifest.webmanifest                                    [39m[1m[2m    0.47 kB[22m[1m[22m
[2mdist/[22m[32mindex.html                                              [39m[1m[2m    3.95 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[32mlogo-horizontal-mvVEptKs.png                     [39m[1m[2m   45.85 kB[22m[1m[22m
[2mdist/[22m[32mbundle-report.json                                      [39m[1m[2m  810.64 kB[22m[1m[22m[2m │ gzip:  76.93 kB[22m
[2mdist/[22m[2massets/[22m[32mtransaction-lifecycle-DuCcaQBZ.jpg               [39m[1m[2m1,175.46 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mevent-lifecycle-CvV3N1nA.jpg                     [39m[1m[2m1,221.66 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mpdf.worker.min-iDqQPrd3.mjs                      [39m[1m[2m1,232.30 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32muser-roles-CevPcr3I.jpg                          [39m[1m[2m1,241.98 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32maccounts-flow-BVCUzNuB.jpg                       [39m[1m[2m1,252.59 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[32mbp-workflow-EJGerC2n.jpg                         [39m[1m[2m1,332.07 kB[22m[1m[22m
[2mdist/[22m[2massets/[22m[35mStrategyPrint-CymDZpv5.css                       [39m[1m[2m    3.64 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[35mAudiencePrint-CdEbyEIQ.css                       [39m[1m[2m    5.16 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[35mindex-CUszSXa7.css                               [39m[1m[2m  171.29 kB[22m[1m[22m[2m │ gzip:  27.24 kB[22m
[2mdist/[22m[2massets/[22m[35mvendor-handsontable-8wq-FOPh.css                 [39m[1m[2m  182.11 kB[22m[1m[22m[2m │ gzip:  21.62 kB[22m
[2mdist/[22m[2massets/[22m[36msubDays-BR8n3PdH.js                              [39m[1m[2m    0.09 kB[22m[1m[22m[2m │ gzip:   0.10 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInMilliseconds-LLbDEX0K.js             [39m[1m[2m    0.12 kB[22m[1m[22m[2m │ gzip:   0.13 kB[22m
[2mdist/[22m[2massets/[22m[36moperacao-labels-Cq-Qt5BS.js                      [39m[1m[2m    0.13 kB[22m[1m[22m[2m │ gzip:   0.12 kB[22m
[2mdist/[22m[2massets/[22m[36museDisplayCurrency-BLsE5JTc.js                   [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mstartOfMonth-CKCw-RWI.js                         [39m[1m[2m    0.15 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mconstants-uO0lGu32.js                            [39m[1m[2m    0.16 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-category-constraint-B8MCXqQh.js               [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.15 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarMonths-B7vAcVWO.js           [39m[1m[2m    0.19 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36mendOfMonth-Bz2Gx-N-.js                           [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.18 kB[22m
[2mdist/[22m[2massets/[22m[36museDebouncedValue-Cqxb45pG.js                    [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.18 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-text-CRO-dKNy.js                             [39m[1m[2m    0.20 kB[22m[1m[22m[2m │ gzip:   0.17 kB[22m
[2mdist/[22m[2massets/[22m[36maddDays-CklYSQT6.js                              [39m[1m[2m    0.21 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mcountry-BQyONak0.js                              [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mslug-Bzks-5QT.js                                 [39m[1m[2m    0.23 kB[22m[1m[22m[2m │ gzip:   0.19 kB[22m
[2mdist/[22m[2massets/[22m[36mrateio-children-CukInAMc.js                      [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.16 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInCalendarDays-CZO_y_Bc.js             [39m[1m[2m    0.24 kB[22m[1m[22m[2m │ gzip:   0.20 kB[22m
[2mdist/[22m[2massets/[22m[36mmust-write-D6vQQ_6o.js                           [39m[1m[2m    0.28 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36meachDayOfInterval-BuSrMpJD.js                    [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.23 kB[22m
[2mdist/[22m[2massets/[22m[36mbackdropClose-BSQpStnO.js                        [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mrelativeTime-CufnskKF.js                         [39m[1m[2m    0.30 kB[22m[1m[22m[2m │ gzip:   0.22 kB[22m
[2mdist/[22m[2massets/[22m[36mskeleton-CynEJeRH.js                             [39m[1m[2m    0.34 kB[22m[1m[22m[2m │ gzip:   0.27 kB[22m
[2mdist/[22m[2massets/[22m[36maddMonths-Dsh0EBap.js                            [39m[1m[2m    0.35 kB[22m[1m[22m[2m │ gzip:   0.25 kB[22m
[2mdist/[22m[2massets/[22m[36mstrategy-status-if_xUdsk.js                      [39m[1m[2m    0.41 kB[22m[1m[22m[2m │ gzip:   0.24 kB[22m
[2mdist/[22m[2massets/[22m[36mform-enter-guard-TC9TB5Pp.js                     [39m[1m[2m    0.43 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mtraction-C6TeXKI5.js                             [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mstring-similarity-B7WDu-Mk.js                    [39m[1m[2m    0.45 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mcreative-media-DKNTK8AD.js                       [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36moverlay-layer-v7nifvMq.js                        [39m[1m[2m    0.50 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mseparator-DygawV0I.js                            [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mdifferenceInDays-ChvF9Jc3.js                     [39m[1m[2m    0.54 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mbudget-mode-Cw2WP49J.js                          [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.40 kB[22m
[2mdist/[22m[2massets/[22m[36museMyLeadFrenteIds-k_QyWrv1.js                   [39m[1m[2m    0.56 kB[22m[1m[22m[2m │ gzip:   0.39 kB[22m
[2mdist/[22m[2massets/[22m[36mgetTimezoneOffsetInMilliseconds-CEhzTjz1.js      [39m[1m[2m    0.58 kB[22m[1m[22m[2m │ gzip:   0.34 kB[22m
[2mdist/[22m[2massets/[22m[36maudience-pdf-RQfvkLkz.js                         [39m[1m[2m    0.64 kB[22m[1m[22m[2m │ gzip:   0.41 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-nature-BSQ-ezBD.js                         [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.45 kB[22m
[2mdist/[22m[2massets/[22m[36museRealtimeInvalidation-3jqJPdPQ.js              [39m[1m[2m    0.78 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mPriorityBadge-BoPyAKOG.js                        [39m[1m[2m    0.80 kB[22m[1m[22m[2m │ gzip:   0.52 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanWarning-DoMAgfcI.js                          [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.42 kB[22m
[2mdist/[22m[2massets/[22m[36museOperacaoFilters-GugmZoSv.js                   [39m[1m[2m    0.81 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36madmin-window-C8tDEl_l.js                         [39m[1m[2m    0.85 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-account-balance-0gpxg5Ch.js                 [39m[1m[2m    0.92 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-rpc-Dy_zcAN5.js                  [39m[1m[2m    0.93 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mcircuit-account-fS8rLhYa.js                      [39m[1m[2m    0.94 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-credits-TLk5jlkZ.js                     [39m[1m[2m    0.98 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mmoney-input-BFJtoh6d.js                          [39m[1m[2m    1.01 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mapp-badge-Be4wA6c7.js                            [39m[1m[2m    1.04 kB[22m[1m[22m[2m │ gzip:   0.51 kB[22m
[2mdist/[22m[2massets/[22m[36mavatar-CNU5K57l.js                               [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.44 kB[22m
[2mdist/[22m[2massets/[22m[36mbank-link-date-DcRav5qG.js                       [39m[1m[2m    1.05 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mPhaseBadge-COgzbG6X.js                           [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.66 kB[22m
[2mdist/[22m[2massets/[22m[36mStaffList-BYMYlvVl.js                            [39m[1m[2m    1.19 kB[22m[1m[22m[2m │ gzip:   0.53 kB[22m
[2mdist/[22m[2massets/[22m[36mzone-capacities-CkVeeYRV.js                      [39m[1m[2m    1.22 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaRateSelect-DVN0ADiT.js                        [39m[1m[2m    1.24 kB[22m[1m[22m[2m │ gzip:   0.61 kB[22m
[2mdist/[22m[2massets/[22m[36mcard-session-helpers-CRwJ-YJJ.js                 [39m[1m[2m    1.31 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36malert-BrTA3y_9.js                                [39m[1m[2m    1.32 kB[22m[1m[22m[2m │ gzip:   0.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoStatusBadge-CSu6KXFE.js                  [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.62 kB[22m
[2mdist/[22m[2massets/[22m[36maccount-balance-zhW94E_0.js                      [39m[1m[2m    1.36 kB[22m[1m[22m[2m │ gzip:   0.69 kB[22m
[2mdist/[22m[2massets/[22m[36mcurrency-DvXZV_Ot.js                             [39m[1m[2m    1.43 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36maccountant-reviews-DKv5iofe.js                   [39m[1m[2m    1.46 kB[22m[1m[22m[2m │ gzip:   0.60 kB[22m
[2mdist/[22m[2massets/[22m[36msupplier-bank-DXAPF33V.js                        [39m[1m[2m    1.51 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-relink-rpb30_wF.js                       [39m[1m[2m    1.52 kB[22m[1m[22m[2m │ gzip:   0.58 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-area-Bavyhs5t.js                          [39m[1m[2m    1.62 kB[22m[1m[22m[2m │ gzip:   0.56 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCachePage-DYW4nshX.js                [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.63 kB[22m
[2mdist/[22m[2massets/[22m[36mcapital-branch-B30zCxFd.js                       [39m[1m[2m    1.67 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36mebitda-BTHqQfAt.js                               [39m[1m[2m    1.74 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mcamarim-helpers-M1Vn5iD-.js                      [39m[1m[2m    1.76 kB[22m[1m[22m[2m │ gzip:   0.78 kB[22m
[2mdist/[22m[2massets/[22m[36maccordion-C7lodvNk.js                            [39m[1m[2m    1.78 kB[22m[1m[22m[2m │ gzip:   0.64 kB[22m
[2mdist/[22m[2massets/[22m[36miban-BYOybSCJ.js                                 [39m[1m[2m    1.79 kB[22m[1m[22m[2m │ gzip:   0.95 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-ocr-prepare-CcJft9v3.js                  [39m[1m[2m    1.85 kB[22m[1m[22m[2m │ gzip:   1.02 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-line-required-E9Q9YTFT.js                     [39m[1m[2m    1.88 kB[22m[1m[22m[2m │ gzip:   0.76 kB[22m
[2mdist/[22m[2massets/[22m[36mEventNatureFilter-cza3OARn.js                    [39m[1m[2m    1.91 kB[22m[1m[22m[2m │ gzip:   0.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExportPage-B6DuoVc8.js           [39m[1m[2m    1.97 kB[22m[1m[22m[2m │ gzip:   0.75 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendenciesPage-DtBjHC8y.js         [39m[1m[2m    1.99 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mdashboard-format-GnqOyAs1.js                     [39m[1m[2m    2.00 kB[22m[1m[22m[2m │ gzip:   0.92 kB[22m
[2mdist/[22m[2massets/[22m[36msettlement-participants-Bipox8NK.js              [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mtoggle-group-DiqmblSz.js                         [39m[1m[2m    2.01 kB[22m[1m[22m[2m │ gzip:   0.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMirrorAporteNotice-BIdr8mlA.js                   [39m[1m[2m    2.05 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mFeatureNotEnabledCard-bnhYcQdD.js                [39m[1m[2m    2.08 kB[22m[1m[22m[2m │ gzip:   0.65 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-ab-calc-BxWHlvfV.js                        [39m[1m[2m    2.10 kB[22m[1m[22m[2m │ gzip:   0.74 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteLeadsAvatars-CtFR3sYg.js                   [39m[1m[2m    2.21 kB[22m[1m[22m[2m │ gzip:   0.87 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-reconciliation-D2g4b26c.js         [39m[1m[2m    2.25 kB[22m[1m[22m[2m │ gzip:   1.05 kB[22m
[2mdist/[22m[2massets/[22m[36museUserPreferences-BQUzJyUd.js                   [39m[1m[2m    2.30 kB[22m[1m[22m[2m │ gzip:   0.70 kB[22m
[2mdist/[22m[2massets/[22m[36mformatDistanceToNow-CgGNwkFO.js                  [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.98 kB[22m
[2mdist/[22m[2massets/[22m[36mpartner-extras-DGvMgLU0.js                       [39m[1m[2m    2.32 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mbp-tx-matching-BHd1Ixbn.js                       [39m[1m[2m    2.38 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36museEventIvaRates-tV42PuWG.js                     [39m[1m[2m    2.64 kB[22m[1m[22m[2m │ gzip:   1.14 kB[22m
[2mdist/[22m[2massets/[22m[36mparseISO-Cr0H38in.js                             [39m[1m[2m    2.70 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCostSourceToggle-UAdte77E.js               [39m[1m[2m    2.90 kB[22m[1m[22m[2m │ gzip:   1.07 kB[22m
[2mdist/[22m[2massets/[22m[36m_LegalLayout-BC6zhk0g.js                         [39m[1m[2m    2.99 kB[22m[1m[22m[2m │ gzip:   0.68 kB[22m
[2mdist/[22m[2massets/[22m[36mreal-cache-calc-Dju230Nr.js                      [39m[1m[2m    3.25 kB[22m[1m[22m[2m │ gzip:   1.47 kB[22m
[2mdist/[22m[2massets/[22m[36mdate-picker-CDzH0ily.js                          [39m[1m[2m    3.27 kB[22m[1m[22m[2m │ gzip:   1.24 kB[22m
[2mdist/[22m[2massets/[22m[36mAcceptInvite-Bl4dygkj.js                         [39m[1m[2m    3.78 kB[22m[1m[22m[2m │ gzip:   1.17 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaAssigneeAvatars-1OCcOm18.js                 [39m[1m[2m    3.80 kB[22m[1m[22m[2m │ gzip:   0.99 kB[22m
[2mdist/[22m[2massets/[22m[36mAdAccounts-DJUXWjIT.js                           [39m[1m[2m    3.85 kB[22m[1m[22m[2m │ gzip:   0.97 kB[22m
[2mdist/[22m[2massets/[22m[36mcache-tab-total-Dy11sDep.js                      [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36mNewStaffDialog-x-mXLSeu.js                       [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.20 kB[22m
[2mdist/[22m[2massets/[22m[36mStatCard--1aFj816.js                             [39m[1m[2m    4.35 kB[22m[1m[22m[2m │ gzip:   1.06 kB[22m
[2mdist/[22m[2massets/[22m[36mcsv-export-Bp8nlkXR.js                           [39m[1m[2m    4.39 kB[22m[1m[22m[2m │ gzip:   1.57 kB[22m
[2mdist/[22m[2massets/[22m[36mImageUploader-DvvG8-IE.js                        [39m[1m[2m    4.64 kB[22m[1m[22m[2m │ gzip:   1.48 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceNew-DKHmm3Ee.js                          [39m[1m[2m    4.76 kB[22m[1m[22m[2m │ gzip:   1.26 kB[22m
[2mdist/[22m[2massets/[22m[36museScenarioForecasts-Ga6ayFbA.js                 [39m[1m[2m    4.77 kB[22m[1m[22m[2m │ gzip:   1.43 kB[22m
[2mdist/[22m[2massets/[22m[36mexport-ticket-office-settlement-pdf-6aH7S_Oc.js  [39m[1m[2m    5.00 kB[22m[1m[22m[2m │ gzip:   2.29 kB[22m
[2mdist/[22m[2massets/[22m[36mMeusChamados-CXfPhwlR.js                         [39m[1m[2m    5.21 kB[22m[1m[22m[2m │ gzip:   1.56 kB[22m
[2mdist/[22m[2massets/[22m[36mUserSettings-uSWoejBY.js                         [39m[1m[2m    5.41 kB[22m[1m[22m[2m │ gzip:   1.67 kB[22m
[2mdist/[22m[2massets/[22m[36minvoice-group-B1Nfmw_d.js                        [39m[1m[2m    5.43 kB[22m[1m[22m[2m │ gzip:   1.76 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersNotice-CceiE0Q7.js               [39m[1m[2m    5.59 kB[22m[1m[22m[2m │ gzip:   1.83 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-BR-Dh5EWHbw.js                                [39m[1m[2m    5.85 kB[22m[1m[22m[2m │ gzip:   2.10 kB[22m
[2mdist/[22m[2massets/[22m[36mpt-B3dxR9FF.js                                   [39m[1m[2m    5.97 kB[22m[1m[22m[2m │ gzip:   2.02 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierBankDetails-o6rJ8ife.js                  [39m[1m[2m    5.99 kB[22m[1m[22m[2m │ gzip:   1.19 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-ticketline-zone-xlsx-vhkMkXJe.js           [39m[1m[2m    6.86 kB[22m[1m[22m[2m │ gzip:   2.59 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoHome-CqwDAaQn.js                         [39m[1m[2m    6.94 kB[22m[1m[22m[2m │ gzip:   1.91 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-BGrCzbHx.js                                [39m[1m[2m    7.16 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36men-US-CpWK9ySR.js                                [39m[1m[2m    7.19 kB[22m[1m[22m[2m │ gzip:   2.47 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoNovo-BZPY_M_a.js                          [39m[1m[2m    7.28 kB[22m[1m[22m[2m │ gzip:   1.84 kB[22m
[2mdist/[22m[2massets/[22m[36museBPVersions-5m2suxwV.js                        [39m[1m[2m    7.53 kB[22m[1m[22m[2m │ gzip:   1.77 kB[22m
[2mdist/[22m[2massets/[22m[36mMinhasTarefas-B2VjdwsS.js                        [39m[1m[2m    7.56 kB[22m[1m[22m[2m │ gzip:   2.15 kB[22m
[2mdist/[22m[2massets/[22m[36mDiagnosisTest-LZcKm0pJ.js                        [39m[1m[2m    7.77 kB[22m[1m[22m[2m │ gzip:   1.58 kB[22m
[2mdist/[22m[2massets/[22m[36mIbanDuplicates-CzME91mR.js                       [39m[1m[2m    7.92 kB[22m[1m[22m[2m │ gzip:   2.04 kB[22m
[2mdist/[22m[2massets/[22m[36mFrentesPanel-C4OmwbM1.js                         [39m[1m[2m    8.07 kB[22m[1m[22m[2m │ gzip:   2.07 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesComparisonPage-fjNtcDww.js            [39m[1m[2m    8.17 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36mSimilarSuppliersReview-K7qnusYG.js               [39m[1m[2m    8.27 kB[22m[1m[22m[2m │ gzip:   1.98 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-format-BK_aU6xe.js                         [39m[1m[2m    8.33 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mAtividade-C4Os1bQp.js                            [39m[1m[2m    8.37 kB[22m[1m[22m[2m │ gzip:   2.33 kB[22m
[2mdist/[22m[2massets/[22m[36mOperacaoListShell-6o3DmT3i.js                    [39m[1m[2m    8.67 kB[22m[1m[22m[2m │ gzip:   2.22 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSalesCurvePage-Dbf5yrY9.js                 [39m[1m[2m    8.68 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategies-CqJpLD5A.js                           [39m[1m[2m    8.89 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mUploadCoalaFotos-DrjRXGFF.js                     [39m[1m[2m    8.93 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mFieldStaffSection-TMZNI6SZ.js                    [39m[1m[2m    9.37 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mimport-pl-xlsx-B3TRs6ux.js                       [39m[1m[2m    9.39 kB[22m[1m[22m[2m │ gzip:   4.03 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAgingPage-yTZeuRrY.js                      [39m[1m[2m    9.42 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mFundHolderPicker-UOfGYZRg.js                     [39m[1m[2m    9.59 kB[22m[1m[22m[2m │ gzip:   1.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountCategoriesPage-CgGffRlr.js          [39m[1m[2m    9.59 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mReportRevenueMixPage-ZcXgZaHr.js                 [39m[1m[2m    9.94 kB[22m[1m[22m[2m │ gzip:   2.16 kB[22m
[2mdist/[22m[2massets/[22m[36museEventABScenarios-BdehcGDz.js                  [39m[1m[2m   10.09 kB[22m[1m[22m[2m │ gzip:   3.73 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMonthlyEvolutionPage-C7H2PLv5.js           [39m[1m[2m   10.19 kB[22m[1m[22m[2m │ gzip:   2.11 kB[22m
[2mdist/[22m[2massets/[22m[36mBankLineDocumentsDialog-DovFhd_7.js              [39m[1m[2m   10.22 kB[22m[1m[22m[2m │ gzip:   2.73 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditDownloads-kU3YIEXi.js                       [39m[1m[2m   10.52 kB[22m[1m[22m[2m │ gzip:   2.19 kB[22m
[2mdist/[22m[2massets/[22m[36mReportOccupancyRatePage-YGHK_0JP.js              [39m[1m[2m   10.56 kB[22m[1m[22m[2m │ gzip:   2.31 kB[22m
[2mdist/[22m[2massets/[22m[36mCreatives-BK4Zvj19.js                            [39m[1m[2m   10.88 kB[22m[1m[22m[2m │ gzip:   2.37 kB[22m
[2mdist/[22m[2massets/[22m[36museCitySimulator-Dvb6_A2W.js                     [39m[1m[2m   10.99 kB[22m[1m[22m[2m │ gzip:   3.61 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBudgetDeviationPage-5CwIdA6s.js            [39m[1m[2m   11.14 kB[22m[1m[22m[2m │ gzip:   2.57 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTreasuryProjectionPage-D7jR_fHu.js         [39m[1m[2m   11.18 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mUserActivityLog-Cj2Mkv_c.js                      [39m[1m[2m   11.21 kB[22m[1m[22m[2m │ gzip:   2.44 kB[22m
[2mdist/[22m[2massets/[22m[36mCardItemDocumentsField-Dt23WqzZ.js               [39m[1m[2m   11.47 kB[22m[1m[22m[2m │ gzip:   2.99 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSupplierConcentrationPage-zT5RCXhn.js      [39m[1m[2m   11.48 kB[22m[1m[22m[2m │ gzip:   2.27 kB[22m
[2mdist/[22m[2massets/[22m[36mReportSuppliersPage-DyYlbWdz.js                  [39m[1m[2m   11.82 kB[22m[1m[22m[2m │ gzip:   2.55 kB[22m
[2mdist/[22m[2massets/[22m[36mManualGaps-CgrgPBWd.js                           [39m[1m[2m   11.83 kB[22m[1m[22m[2m │ gzip:   2.61 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogList-CQ-gu_e7.js                             [39m[1m[2m   11.85 kB[22m[1m[22m[2m │ gzip:   2.20 kB[22m
[2mdist/[22m[2massets/[22m[36mLinkBpLineDialog-BCQp4nOY.js                     [39m[1m[2m   11.85 kB[22m[1m[22m[2m │ gzip:   2.65 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadoDetail-D7ng3P0M.js                        [39m[1m[2m   12.08 kB[22m[1m[22m[2m │ gzip:   2.85 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPanel-RtAp9Qm4.js                           [39m[1m[2m   12.10 kB[22m[1m[22m[2m │ gzip:   3.62 kB[22m
[2mdist/[22m[2massets/[22m[36mOnboarding-FkdX99kE.js                           [39m[1m[2m   12.25 kB[22m[1m[22m[2m │ gzip:   2.81 kB[22m
[2mdist/[22m[2massets/[22m[36mReportProfitabilityPage-Du_tW9DF.js              [39m[1m[2m   12.32 kB[22m[1m[22m[2m │ gzip:   2.92 kB[22m
[2mdist/[22m[2massets/[22m[36mCrmDashboard-BTLjxuqY.js                         [39m[1m[2m   12.37 kB[22m[1m[22m[2m │ gzip:   2.96 kB[22m
[2mdist/[22m[2massets/[22m[36mGoogleAdsAdmin-BKpe0giV.js                       [39m[1m[2m   12.68 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginasList-hHjE-RuE.js                          [39m[1m[2m   12.99 kB[22m[1m[22m[2m │ gzip:   2.60 kB[22m
[2mdist/[22m[2massets/[22m[36mformat-CGtoj5si.js                               [39m[1m[2m   13.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditCampaignPopover-C3CPy988.js                  [39m[1m[2m   13.30 kB[22m[1m[22m[2m │ gzip:   3.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReminders-NuhoykbX.js                            [39m[1m[2m   13.37 kB[22m[1m[22m[2m │ gzip:   2.91 kB[22m
[2mdist/[22m[2massets/[22m[36mSyncHealth-BK8oFF4x.js                           [39m[1m[2m   13.53 kB[22m[1m[22m[2m │ gzip:   2.43 kB[22m
[2mdist/[22m[2massets/[22m[36mEndossarEventoPage-BFh6ryLy.js                   [39m[1m[2m   13.69 kB[22m[1m[22m[2m │ gzip:   2.94 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPendencyIndexPage-Dl6p2Vou.js              [39m[1m[2m   13.78 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencesList-D8FqEn_G.js                        [39m[1m[2m   13.94 kB[22m[1m[22m[2m │ gzip:   2.75 kB[22m
[2mdist/[22m[2massets/[22m[36mCategoryFormModal-SkAzY4o3.js                    [39m[1m[2m   14.10 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEndorsementEditor-DVYnwZub.js                    [39m[1m[2m   14.25 kB[22m[1m[22m[2m │ gzip:   2.76 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePreviewCount-D4Dg7C1N.js                 [39m[1m[2m   14.30 kB[22m[1m[22m[2m │ gzip:   3.64 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceEditor-Dy8W6Igq.js                       [39m[1m[2m   14.68 kB[22m[1m[22m[2m │ gzip:   2.82 kB[22m
[2mdist/[22m[2massets/[22m[36mTrash-i0a-cbyo.js                                [39m[1m[2m   14.84 kB[22m[1m[22m[2m │ gzip:   3.13 kB[22m
[2mdist/[22m[2massets/[22m[36mNewEventoPage-COgEN5Pj.js                        [39m[1m[2m   14.95 kB[22m[1m[22m[2m │ gzip:   2.69 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerExpensesPage-D7mBxBBG.js            [39m[1m[2m   14.96 kB[22m[1m[22m[2m │ gzip:   3.12 kB[22m
[2mdist/[22m[2massets/[22m[36mChamadosList-CLsygbBi.js                         [39m[1m[2m   15.43 kB[22m[1m[22m[2m │ gzip:   4.05 kB[22m
[2mdist/[22m[2massets/[22m[36mContactDetailsSheet-Drr0BJ0J.js                  [39m[1m[2m   15.50 kB[22m[1m[22m[2m │ gzip:   2.67 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBI-CCCIeTlp.js                              [39m[1m[2m   15.53 kB[22m[1m[22m[2m │ gzip:   3.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantPendencies-CgwynWVh.js                 [39m[1m[2m   15.57 kB[22m[1m[22m[2m │ gzip:   3.37 kB[22m
[2mdist/[22m[2massets/[22m[36mInvoiceGroupAudit-DSLXZ1iS.js                    [39m[1m[2m   15.67 kB[22m[1m[22m[2m │ gzip:   3.19 kB[22m
[2mdist/[22m[2massets/[22m[36mRlsLegacyAudit-BjJGZIND.js                       [39m[1m[2m   15.77 kB[22m[1m[22m[2m │ gzip:   2.79 kB[22m
[2mdist/[22m[2massets/[22m[36mRaiseBudgetDialog-Cx4z74oj.js                    [39m[1m[2m   16.04 kB[22m[1m[22m[2m │ gzip:   3.48 kB[22m
[2mdist/[22m[2massets/[22m[36mEditFrenteSheet-DbJ438W6.js                      [39m[1m[2m   16.10 kB[22m[1m[22m[2m │ gzip:   3.43 kB[22m
[2mdist/[22m[2massets/[22m[36mPaginaEditor-DSiZqO8W.js                         [39m[1m[2m   16.53 kB[22m[1m[22m[2m │ gzip:   3.23 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNew-Bd2dWo0N.js                          [39m[1m[2m   16.99 kB[22m[1m[22m[2m │ gzip:   3.99 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierTransactions-6yPmIGNG.js                 [39m[1m[2m   17.03 kB[22m[1m[22m[2m │ gzip:   3.59 kB[22m
[2mdist/[22m[2massets/[22m[36mPurchaseAudienceCard-ZPJFz2HU.js                 [39m[1m[2m   17.26 kB[22m[1m[22m[2m │ gzip:   3.34 kB[22m
[2mdist/[22m[2massets/[22m[36mSetup-DvKQgQKw.js                                [39m[1m[2m   17.43 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mPessoaDetail-BYt0PoKl.js                         [39m[1m[2m   17.78 kB[22m[1m[22m[2m │ gzip:   3.52 kB[22m
[2mdist/[22m[2massets/[22m[36mibantools--sXKtUqI.js                            [39m[1m[2m   18.29 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mInvariantMonitor-B-kcVY_Y.js                     [39m[1m[2m   18.44 kB[22m[1m[22m[2m │ gzip:   3.35 kB[22m
[2mdist/[22m[2massets/[22m[36mClubeNewgang-B7cR4M-m.js                         [39m[1m[2m   18.69 kB[22m[1m[22m[2m │ gzip:   3.16 kB[22m
[2mdist/[22m[2massets/[22m[36mTerms-Bys25Lmj.js                                [39m[1m[2m   18.88 kB[22m[1m[22m[2m │ gzip:   2.98 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREEmpresarialPage-BaVUDWhB.js             [39m[1m[2m   18.92 kB[22m[1m[22m[2m │ gzip:   5.01 kB[22m
[2mdist/[22m[2massets/[22m[36mAbout-Bdqzj1uc.js                                [39m[1m[2m   19.17 kB[22m[1m[22m[2m │ gzip:   2.88 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountCategories-9MXZfRGG.js                    [39m[1m[2m   19.46 kB[22m[1m[22m[2m │ gzip:   3.75 kB[22m
[2mdist/[22m[2massets/[22m[36mNotifications-Bbb_-duV.js                        [39m[1m[2m   19.46 kB[22m[1m[22m[2m │ gzip:   2.58 kB[22m
[2mdist/[22m[2massets/[22m[36mQuotations-C8trfOCd.js                           [39m[1m[2m   19.88 kB[22m[1m[22m[2m │ gzip:   3.82 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementations-Oc18BAcs.js                 [39m[1m[2m   20.02 kB[22m[1m[22m[2m │ gzip:   3.90 kB[22m
[2mdist/[22m[2massets/[22m[36mBlogEditor-Ci8rkn9X.js                           [39m[1m[2m   20.26 kB[22m[1m[22m[2m │ gzip:   3.85 kB[22m
[2mdist/[22m[2massets/[22m[36mVideosList-ClkH1Lsw.js                           [39m[1m[2m   20.26 kB[22m[1m[22m[2m │ gzip:   4.08 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPartnerSettlementPage-Cilr_eBe.js          [39m[1m[2m   20.62 kB[22m[1m[22m[2m │ gzip:   3.89 kB[22m
[2mdist/[22m[2massets/[22m[36mPressList-uks8SWt5.js                            [39m[1m[2m   21.47 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDocumentPendencies-FoisBtzE.js             [39m[1m[2m   21.79 kB[22m[1m[22m[2m │ gzip:   3.74 kB[22m
[2mdist/[22m[2massets/[22m[36mDuelView-46eRcXJ8.js                             [39m[1m[2m   21.93 kB[22m[1m[22m[2m │ gzip:   4.79 kB[22m
[2mdist/[22m[2massets/[22m[36mPortalSettings-CoLCGt6C.js                       [39m[1m[2m   22.20 kB[22m[1m[22m[2m │ gzip:   4.13 kB[22m
[2mdist/[22m[2massets/[22m[36mparse-B9BIfq30.js                                [39m[1m[2m   22.36 kB[22m[1m[22m[2m │ gzip:   4.64 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteDetail-BwYnZIt7.js                         [39m[1m[2m   22.42 kB[22m[1m[22m[2m │ gzip:   4.54 kB[22m
[2mdist/[22m[2massets/[22m[36mEventosList-Et2kRYZU.js                          [39m[1m[2m   22.97 kB[22m[1m[22m[2m │ gzip:   3.79 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimEquipa-CeHo4ud3.js                        [39m[1m[2m   23.24 kB[22m[1m[22m[2m │ gzip:   4.97 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyNewDesign-BAMewiE9.js                    [39m[1m[2m   23.58 kB[22m[1m[22m[2m │ gzip:   4.96 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeNew-C2C7uVsq.js                          [39m[1m[2m   24.31 kB[22m[1m[22m[2m │ gzip:   5.42 kB[22m
[2mdist/[22m[2massets/[22m[36mCampoView-kXJTJJDT.js                            [39m[1m[2m   24.43 kB[22m[1m[22m[2m │ gzip:   5.28 kB[22m
[2mdist/[22m[2massets/[22m[36mReportCashFlowPage-DFe7FHOf.js                   [39m[1m[2m   24.65 kB[22m[1m[22m[2m │ gzip:   4.50 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPrint-0kCsCwG_.js                        [39m[1m[2m   24.94 kB[22m[1m[22m[2m │ gzip:   3.72 kB[22m
[2mdist/[22m[2massets/[22m[36mReportIvaAuditPage-DtanFTbY.js                   [39m[1m[2m   25.04 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mCustomerMatchUpload-UMtro39C.js                  [39m[1m[2m   25.31 kB[22m[1m[22m[2m │ gzip:   4.15 kB[22m
[2mdist/[22m[2massets/[22m[36mpurify.es-8E279hYE.js                            [39m[1m[2m   25.61 kB[22m[1m[22m[2m │ gzip:   9.67 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyPlanCard-DLTqv_cu.js                     [39m[1m[2m   25.70 kB[22m[1m[22m[2m │ gzip:   4.19 kB[22m
[2mdist/[22m[2massets/[22m[36mEventTrackersCard-k5jQEGkw.js                    [39m[1m[2m   25.88 kB[22m[1m[22m[2m │ gzip:   4.40 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDailySalesPage-D5z72j9Y.js                 [39m[1m[2m   26.20 kB[22m[1m[22m[2m │ gzip:   5.40 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessions-CFs2IAdV.js                         [39m[1m[2m   26.49 kB[22m[1m[22m[2m │ gzip:   5.39 kB[22m
[2mdist/[22m[2massets/[22m[36mReconciliacaoBpTx-Cz-1ITy2.js                    [39m[1m[2m   27.23 kB[22m[1m[22m[2m │ gzip:   5.27 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapasList-Lu1s8EI9.js                           [39m[1m[2m   27.40 kB[22m[1m[22m[2m │ gzip:   6.95 kB[22m
[2mdist/[22m[2massets/[22m[36mReportAccountingExport-CZvthPd6.js               [39m[1m[2m   28.02 kB[22m[1m[22m[2m │ gzip:   5.05 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignFromScratch-DEGpf97y.js                  [39m[1m[2m   28.24 kB[22m[1m[22m[2m │ gzip:   5.26 kB[22m
[2mdist/[22m[2massets/[22m[36mPixels-Cs7QZ5Nm.js                               [39m[1m[2m   28.78 kB[22m[1m[22m[2m │ gzip:   4.43 kB[22m
[2mdist/[22m[2massets/[22m[36mRecurringTransactions-BJskCOnM.js                [39m[1m[2m   28.99 kB[22m[1m[22m[2m │ gzip:   5.03 kB[22m
[2mdist/[22m[2massets/[22m[36mContactosList-BdHk9gTo.js                        [39m[1m[2m   29.48 kB[22m[1m[22m[2m │ gzip:   5.78 kB[22m
[2mdist/[22m[2massets/[22m[36mUserManagement-CVjUcDWO.js                       [39m[1m[2m   30.33 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mConnections-D8YF27r5.js                          [39m[1m[2m   30.44 kB[22m[1m[22m[2m │ gzip:   6.42 kB[22m
[2mdist/[22m[2massets/[22m[36mevent-revenue-basis-DcoLXyym.js                  [39m[1m[2m   30.57 kB[22m[1m[22m[2m │ gzip:  10.48 kB[22m
[2mdist/[22m[2massets/[22m[36mFormalidadeAudit-CggHY8ks.js                     [39m[1m[2m   30.82 kB[22m[1m[22m[2m │ gzip:   5.55 kB[22m
[2mdist/[22m[2massets/[22m[36mLeadsList-BvywktLa.js                            [39m[1m[2m   31.26 kB[22m[1m[22m[2m │ gzip:   5.02 kB[22m
[2mdist/[22m[2massets/[22m[36mDataEntryDialog-CTKZuere.js                      [39m[1m[2m   31.31 kB[22m[1m[22m[2m │ gzip:   6.24 kB[22m
[2mdist/[22m[2massets/[22m[36mReportArtistCache-XwkCAsSV.js                    [39m[1m[2m   32.32 kB[22m[1m[22m[2m │ gzip:   8.50 kB[22m
[2mdist/[22m[2massets/[22m[36mInsights-D7BL4pI4.js                             [39m[1m[2m   32.38 kB[22m[1m[22m[2m │ gzip:   4.81 kB[22m
[2mdist/[22m[2massets/[22m[36mBolSync-C8K9mSa2.js                              [39m[1m[2m   32.63 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaCapiMonitor-CcupzkDW.js                      [39m[1m[2m   32.68 kB[22m[1m[22m[2m │ gzip:   4.32 kB[22m
[2mdist/[22m[2massets/[22m[36mCartaoEquipa-gMCPpH2P.js                         [39m[1m[2m   32.79 kB[22m[1m[22m[2m │ gzip:   7.48 kB[22m
[2mdist/[22m[2massets/[22m[36mBatchPaymentModal-CsvlpEg8.js                    [39m[1m[2m   33.14 kB[22m[1m[22m[2m │ gzip:   8.38 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaSuppliersPanel-C4mLhap2.js                  [39m[1m[2m   33.17 kB[22m[1m[22m[2m │ gzip:   4.50 kB[22m
[2mdist/[22m[2massets/[22m[36mIvaManagement-BZ49iKEk.js                        [39m[1m[2m   33.91 kB[22m[1m[22m[2m │ gzip:   5.30 kB[22m
[2mdist/[22m[2massets/[22m[36mPrivacy-Fn_7BnRq.js                              [39m[1m[2m   33.97 kB[22m[1m[22m[2m │ gzip:   4.94 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIDetail-BeTYXi5C.js                        [39m[1m[2m   34.46 kB[22m[1m[22m[2m │ gzip:   8.16 kB[22m
[2mdist/[22m[2massets/[22m[36mcalendar-BnWfpFKm.js                             [39m[1m[2m   35.02 kB[22m[1m[22m[2m │ gzip:  11.08 kB[22m
[2mdist/[22m[2massets/[22m[36mReportForecastPayablesPage-Dt9KV5CX.js           [39m[1m[2m   35.60 kB[22m[1m[22m[2m │ gzip:   5.74 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketlineSync-DGAK6Sws.js                       [39m[1m[2m   35.67 kB[22m[1m[22m[2m │ gzip:   5.86 kB[22m
[2mdist/[22m[2massets/[22m[36mFunnelTest-DGmAWvHj.js                           [39m[1m[2m   36.39 kB[22m[1m[22m[2m │ gzip:   7.53 kB[22m
[2mdist/[22m[2massets/[22m[36mReportContasPagarPage-CTDbtpzi.js                [39m[1m[2m   37.30 kB[22m[1m[22m[2m │ gzip:   6.77 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionDocumentsModal-pWPyQEVk.js            [39m[1m[2m   37.37 kB[22m[1m[22m[2m │ gzip:   7.90 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREBrasilPage-B0kgzpqU.js                  [39m[1m[2m   37.63 kB[22m[1m[22m[2m │ gzip:   7.39 kB[22m
[2mdist/[22m[2massets/[22m[36mAudit-C1HIOZ2x.js                                [39m[1m[2m   38.42 kB[22m[1m[22m[2m │ gzip:   6.63 kB[22m
[2mdist/[22m[2massets/[22m[36mDashboard-DDbxDH8m.js                            [39m[1m[2m   38.67 kB[22m[1m[22m[2m │ gzip:   7.62 kB[22m
[2mdist/[22m[2massets/[22m[36mBPPlanilha-Pw9Vv7eK.js                           [39m[1m[2m   39.46 kB[22m[1m[22m[2m │ gzip:  11.59 kB[22m
[2mdist/[22m[2massets/[22m[36mHelpCenter-Bf8-MD3l.js                           [39m[1m[2m   39.73 kB[22m[1m[22m[2m │ gzip:  12.09 kB[22m
[2mdist/[22m[2massets/[22m[36mCompanies-BXUVOjOu.js                            [39m[1m[2m   40.64 kB[22m[1m[22m[2m │ gzip:   6.10 kB[22m
[2mdist/[22m[2massets/[22m[36mFrenteManage-BlCFu0yT.js                         [39m[1m[2m   42.12 kB[22m[1m[22m[2m │ gzip:   6.95 kB[22m
[2mdist/[22m[2massets/[22m[36mmarked.esm-DiRRsLPS.js                           [39m[1m[2m   42.33 kB[22m[1m[22m[2m │ gzip:  12.79 kB[22m
[2mdist/[22m[2massets/[22m[36mMetaAudiencesList-pJ5GWB2w.js                    [39m[1m[2m   42.35 kB[22m[1m[22m[2m │ gzip:   6.50 kB[22m
[2mdist/[22m[2massets/[22m[36mReportDREPage-CQ977r8J.js                        [39m[1m[2m   43.66 kB[22m[1m[22m[2m │ gzip:   8.62 kB[22m
[2mdist/[22m[2massets/[22m[36mReportMovementReconciliationPage-PSTma24g.js     [39m[1m[2m   43.94 kB[22m[1m[22m[2m │ gzip:   7.86 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementsOverview-Bhqkps_u.js      [39m[1m[2m   44.47 kB[22m[1m[22m[2m │ gzip:   7.06 kB[22m
[2mdist/[22m[2massets/[22m[36mFeverSync-BAxEhmqq.js                            [39m[1m[2m   45.41 kB[22m[1m[22m[2m │ gzip:   8.37 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarim-CBMvOyYF.js                              [39m[1m[2m   45.57 kB[22m[1m[22m[2m │ gzip:   7.36 kB[22m
[2mdist/[22m[2massets/[22m[36msortable.esm-BeM3CyY0.js                         [39m[1m[2m   45.88 kB[22m[1m[22m[2m │ gzip:  15.28 kB[22m
[2mdist/[22m[2massets/[22m[36mSecurityDashboard-DNQ4ajK5.js                    [39m[1m[2m   46.25 kB[22m[1m[22m[2m │ gzip:   6.87 kB[22m
[2mdist/[22m[2massets/[22m[36mEquipaView-B5g9SCQf.js                           [39m[1m[2m   47.24 kB[22m[1m[22m[2m │ gzip:   8.13 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBPTransactionsPage-Cc50ZuJ-.js             [39m[1m[2m   47.25 kB[22m[1m[22m[2m │ gzip:   8.89 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantStandaloneInvoicesTab-BDygPC1o.js      [39m[1m[2m   50.32 kB[22m[1m[22m[2m │ gzip:  11.02 kB[22m
[2mdist/[22m[2massets/[22m[36mDatabaseBackups-CL9rk71y.js                      [39m[1m[2m   50.67 kB[22m[1m[22m[2m │ gzip:   8.60 kB[22m
[2mdist/[22m[2massets/[22m[36mZonasList-C3UsKkpU.js                            [39m[1m[2m   50.70 kB[22m[1m[22m[2m │ gzip:  10.04 kB[22m
[2mdist/[22m[2massets/[22m[36mEtapaDetail-Cadm6Gbu.js                          [39m[1m[2m   50.74 kB[22m[1m[22m[2m │ gzip:   9.13 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulatorDemo-CUmKcWUE.js                   [39m[1m[2m   50.84 kB[22m[1m[22m[2m │ gzip:   6.32 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPLPage-Cc9WdO-F.js                         [39m[1m[2m   52.50 kB[22m[1m[22m[2m │ gzip:  10.35 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyRedesign-Bc75dHuF.js                     [39m[1m[2m   52.61 kB[22m[1m[22m[2m │ gzip:   8.06 kB[22m
[2mdist/[22m[2massets/[22m[36mReportBankStatementPage-BQkt8RWr.js              [39m[1m[2m   52.93 kB[22m[1m[22m[2m │ gzip:  10.23 kB[22m
[2mdist/[22m[2massets/[22m[36mCreativeView-CKADSzWs.js                         [39m[1m[2m   53.19 kB[22m[1m[22m[2m │ gzip:   8.04 kB[22m
[2mdist/[22m[2massets/[22m[36mStandaloneInvoiceScanner-B6bs68G6.js             [39m[1m[2m   54.63 kB[22m[1m[22m[2m │ gzip:  13.11 kB[22m
[2mdist/[22m[2massets/[22m[36mAudienceGoogleAds-DjOpeMAJ.js                    [39m[1m[2m   56.02 kB[22m[1m[22m[2m │ gzip:  10.02 kB[22m
[2mdist/[22m[2massets/[22m[36mReimbursements-DacDIPOY.js                       [39m[1m[2m   59.85 kB[22m[1m[22m[2m │ gzip:  11.28 kB[22m
[2mdist/[22m[2massets/[22m[36mRegistroFeed-B3sJsnEy.js                         [39m[1m[2m   65.39 kB[22m[1m[22m[2m │ gzip:  10.94 kB[22m
[2mdist/[22m[2massets/[22m[36mAdsInvoices-CnEPoGa3.js                          [39m[1m[2m   67.05 kB[22m[1m[22m[2m │ gzip:  11.70 kB[22m
[2mdist/[22m[2massets/[22m[36mEvents-Fzp2Ha6k.js                               [39m[1m[2m   67.68 kB[22m[1m[22m[2m │ gzip:  11.97 kB[22m
[2mdist/[22m[2massets/[22m[36mReportTicketOfficeAuditPage-MGwsSX9L.js          [39m[1m[2m   68.92 kB[22m[1m[22m[2m │ gzip:  11.51 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimItemAttachmentButton-CV_Ghnga.js          [39m[1m[2m   69.22 kB[22m[1m[22m[2m │ gzip:  15.79 kB[22m
[2mdist/[22m[2massets/[22m[36mManualSync-BmsKZ23g.js                           [39m[1m[2m   69.29 kB[22m[1m[22m[2m │ gzip:  22.05 kB[22m
[2mdist/[22m[2massets/[22m[36mEventCalendar-BGI8D6Vt.js                        [39m[1m[2m   69.55 kB[22m[1m[22m[2m │ gzip:  11.73 kB[22m
[2mdist/[22m[2massets/[22m[36mSalesBIEvent-C1vDHjor.js                         [39m[1m[2m   69.88 kB[22m[1m[22m[2m │ gzip:  12.41 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOfficeSettlementModal-aigJ1oX6.js          [39m[1m[2m   75.51 kB[22m[1m[22m[2m │ gzip:  13.45 kB[22m
[2mdist/[22m[2massets/[22m[36mSuppliers-Cl7SN-lm.js                            [39m[1m[2m   78.23 kB[22m[1m[22m[2m │ gzip:  12.21 kB[22m
[2mdist/[22m[2massets/[22m[36minstallment-guard-DOWE7_Lh.js                    [39m[1m[2m   82.82 kB[22m[1m[22m[2m │ gzip:  15.16 kB[22m
[2mdist/[22m[2massets/[22m[36mAccountantHome-CvH5vosW.js                       [39m[1m[2m   84.56 kB[22m[1m[22m[2m │ gzip:  13.11 kB[22m
[2mdist/[22m[2massets/[22m[36mEventHub-DH1IzO_p.js                             [39m[1m[2m   84.92 kB[22m[1m[22m[2m │ gzip:  13.86 kB[22m
[2mdist/[22m[2massets/[22m[36mSupplierFormModal-C5cJBpDJ.js                    [39m[1m[2m   85.46 kB[22m[1m[22m[2m │ gzip:  18.67 kB[22m
[2mdist/[22m[2massets/[22m[36mCoalaSync-fKALVNnl.js                            [39m[1m[2m   87.33 kB[22m[1m[22m[2m │ gzip:  15.06 kB[22m
[2mdist/[22m[2massets/[22m[36mAudiencePrint-MOTADZcN.js                        [39m[1m[2m   87.42 kB[22m[1m[22m[2m │ gzip:  11.00 kB[22m
[2mdist/[22m[2massets/[22m[36mAuditoriaContas-nD4PrRCY.js                      [39m[1m[2m   91.98 kB[22m[1m[22m[2m │ gzip:  16.83 kB[22m
[2mdist/[22m[2massets/[22m[36mjszip.min-BLoh7Lew.js                            [39m[1m[2m   97.24 kB[22m[1m[22m[2m │ gzip:  30.05 kB[22m
[2mdist/[22m[2massets/[22m[36mFinancialAccounts-LloRQ4Zi.js                    [39m[1m[2m  116.63 kB[22m[1m[22m[2m │ gzip:  18.15 kB[22m
[2mdist/[22m[2massets/[22m[36mStrategyView-CNP19qc6.js                         [39m[1m[2m  122.01 kB[22m[1m[22m[2m │ gzip:  18.96 kB[22m
[2mdist/[22m[2massets/[22m[36mEventMarketingEditor-C7fSIQ0Y.js                 [39m[1m[2m  124.85 kB[22m[1m[22m[2m │ gzip:  18.22 kB[22m
[2mdist/[22m[2massets/[22m[36mCamarimSessionDetail-DA9ucPfL.js                 [39m[1m[2m  132.24 kB[22m[1m[22m[2m │ gzip:  23.47 kB[22m
[2mdist/[22m[2massets/[22m[36mBankReconciliation-CiQD8wnT.js                   [39m[1m[2m  134.51 kB[22m[1m[22m[2m │ gzip:  26.75 kB[22m
[2mdist/[22m[2massets/[22m[36mCardSessionDetail-DIa_f0Az.js                    [39m[1m[2m  147.32 kB[22m[1m[22m[2m │ gzip:  27.45 kB[22m
[2mdist/[22m[2massets/[22m[36mindex.es-DAv-d8Cn.js                             [39m[1m[2m  150.74 kB[22m[1m[22m[2m │ gzip:  51.38 kB[22m
[2mdist/[22m[2massets/[22m[36mNewgangSite-BJdMcACh.js                          [39m[1m[2m  151.22 kB[22m[1m[22m[2m │ gzip:  26.67 kB[22m
[2mdist/[22m[2massets/[22m[36mReportPaymentListsPage-BCwfC1te.js               [39m[1m[2m  199.69 kB[22m[1m[22m[2m │ gzip:  39.42 kB[22m
[2mdist/[22m[2massets/[22m[36mticket-office-settlement-form-BG_ZcmX2.js        [39m[1m[2m  199.94 kB[22m[1m[22m[2m │ gzip:  40.70 kB[22m
[2mdist/[22m[2massets/[22m[36mhtml2canvas.esm-CBrSDip1.js                      [39m[1m[2m  201.42 kB[22m[1m[22m[2m │ gzip:  47.70 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-supabase-GZnodCyP.js                      [39m[1m[2m  209.56 kB[22m[1m[22m[2m │ gzip:  54.23 kB[22m
[2mdist/[22m[2massets/[22m[36mEventImplementationDetail-D4rzyipB.js            [39m[1m[2m  224.11 kB[22m[1m[22m[2m │ gzip:  36.29 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaigns-CLBv12FH.js                            [39m[1m[2m  242.60 kB[22m[1m[22m[2m │ gzip:  42.65 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactions-BxBkNFI6.js                         [39m[1m[2m  260.45 kB[22m[1m[22m[2m │ gzip:  46.58 kB[22m
[2mdist/[22m[2massets/[22m[36mEventSimulator-B44e75_1.js                       [39m[1m[2m  285.61 kB[22m[1m[22m[2m │ gzip:  46.20 kB[22m
[2mdist/[22m[2massets/[22m[36mTicketOffices-CR2TcLnY.js                        [39m[1m[2m  316.46 kB[22m[1m[22m[2m │ gzip:  53.20 kB[22m
[2mdist/[22m[2massets/[22m[36mTransactionEditModal-Bbm155ae.js                 [39m[1m[2m  344.80 kB[22m[1m[22m[2m │ gzip:  59.56 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-pdf-9vWhuqh2.js                           [39m[1m[2m  421.80 kB[22m[1m[22m[2m │ gzip: 137.18 kB[22m
[2mdist/[22m[2massets/[22m[36mCampaignView-Csy3w-MF.js                         [39m[1m[2m  436.20 kB[22m[1m[22m[2m │ gzip:  72.73 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-react-7B7VXPPM.js                         [39m[1m[2m  437.56 kB[22m[1m[22m[2m │ gzip: 134.58 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-charts-ChC8BtpM.js                        [39m[1m[2m  448.41 kB[22m[1m[22m[2m │ gzip: 119.60 kB[22m
[2mdist/[22m[2massets/[22m[36mpdf-first-page-to-jpeg-M5CLsCvW.js               [39m[1m[2m  458.53 kB[22m[1m[22m[2m │ gzip: 135.85 kB[22m
[2mdist/[22m[2massets/[22m[36mEventForecast-BMJHOU2w.js                        [39m[1m[33m  744.08 kB[39m[22m[2m │ gzip: 128.71 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-ui-9Zt-nPwE.js                            [39m[1m[33m1,069.60 kB[39m[22m[2m │ gzip: 220.49 kB[22m
[2mdist/[22m[2massets/[22m[36mEventDetail-Dwo-YE5Y.js                          [39m[1m[33m1,075.35 kB[39m[22m[2m │ gzip: 184.51 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-UiEDnH-L.js                                [39m[1m[33m1,198.79 kB[39m[22m[2m │ gzip: 265.25 kB[22m
[2mdist/[22m[2massets/[22m[36mheic2any-Cil2PCpn.js                             [39m[1m[33m1,352.85 kB[39m[22m[2m │ gzip: 341.38 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-xlsx-D3_Ux5L7.js                          [39m[1m[33m1,369.76 kB[39m[22m[2m │ gzip: 412.26 kB[22m
[2mdist/[22m[2massets/[22m[36mvendor-handsontable-DN7Hyz86.js                  [39m[1m[33m1,918.23 kB[39m[22m[2m │ gzip: 457.52 kB[22m
[2mdist/[22m[2massets/[22m[36mheic-to-lXPrQE7P.js                              [39m[1m[33m2,995.46 kB[39m[22m[2m │ gzip: 736.99 kB[22m
[32m✓ built in 1m 14s[39m

PWA v1.3.0
mode      generateSW
precache  343 entries (24190.94 KiB)
files generated
  dist/sw.js
  dist/workbox-52dea471.js
Browserslist: browsers data (caniuse-lite) is 7 months old. Please run:
  npx update-browserslist-db@latest
  Why you should do it regularly: https://github.com/browserslist/update-db#readme
[1m[33m[plugin:vite:reporter][39m[22m [33m[plugin vite:reporter] 
(!) /tmp/issue333-head-29p36gir/tree/src/lib/storage.ts is dynamically imported by /tmp/issue333-head-29p36gir/tree/src/contexts/AuthContext.tsx, /tmp/issue333-head-29p36gir/tree/src/contexts/AuthContext.tsx, /tmp/issue333-head-29p36gir/tree/src/hooks/useCompany.ts but also statically imported by /tmp/issue333-head-29p36gir/tree/src/components/BPNotesAttachmentsModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/CacheExtrasPanel.tsx, /tmp/issue333-head-29p36gir/tree/src/components/EntityDocumentsSection.tsx, /tmp/issue333-head-29p36gir/tree/src/components/EventABAttachmentsSection.tsx, /tmp/issue333-head-29p36gir/tree/src/components/EventClosingCosts.tsx, /tmp/issue333-head-29p36gir/tree/src/components/EventForecast.tsx, /tmp/issue333-head-29p36gir/tree/src/components/PartnerExtrasPanel.tsx, /tmp/issue333-head-29p36gir/tree/src/components/PaymentListReceipts.tsx, /tmp/issue333-head-29p36gir/tree/src/components/SupplierCreditsPanel.tsx, /tmp/issue333-head-29p36gir/tree/src/components/TicketOfficeSettlementModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/TransactionDocumentsModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/TransactionFormModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/bank/BankLineDocumentsDialog.tsx, /tmp/issue333-head-29p36gir/tree/src/components/camarim/CamarimItemAttachmentButton.tsx, /tmp/issue333-head-29p36gir/tree/src/components/camarim/CamarimItemModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/cards/NewCardExpenseModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/supplier-credits/NewSupplierCreditModal.tsx, /tmp/issue333-head-29p36gir/tree/src/components/supplier-credits/SupplierCreditsTab.tsx, /tmp/issue333-head-29p36gir/tree/src/pages/BankReconciliation.tsx, /tmp/issue333-head-29p36gir/tree/src/pages/EventImplementations.tsx, /tmp/issue333-head-29p36gir/tree/src/pages/PartnerEventDetail.tsx, /tmp/issue333-head-29p36gir/tree/src/pages/StandaloneInvoiceScanner.tsx, /tmp/issue333-head-29p36gir/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx, dynamic import will not move module into another chunk.
[39m
[33m
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.[39m

EXIT: 0

```

## eighth-run.log
```text
Evidence directory: /tmp/issue333-head-wq056gvi
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-wq056gvi/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because vite config has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 20500[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 18703[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 16777 8108eb8d-0cc8-4833-897e-0f448cfe285e /tmp/issue333-head-wq056gvi
Traceback (most recent call last):
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:24:41
[2m   Duration [22m 22.85s[2m (transform 633ms, setup 114ms, collect 1.18s, tests 20.50s, environment 536ms, prepare 294ms)[22m

issue333/head/react-journeys.py 16777 8108eb8d-0cc8-4833-897e-0f448cfe285e /tmp/issue333-head-wq056gvi
Traceback (most recent call last):
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-wq056gvi/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## eleventh-run.log
```text
Evidence directory: /tmp/issue333-head-ax8_kuqu
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-ax8_kuqu/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 22031[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 19621[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 59166 14de90f6-5889-4432-954d-7057d8ed8d15 /tmp/issue333-head-ax8_kuqu
Traceback (most recent call last):
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:26:20
[2m   Duration [22m 26.22s[2m (transform 1.00s, setup 181ms, collect 1.97s, tests 22.03s, environment 950ms, prepare 525ms)[22m

issue333/head/react-journeys.py 59166 14de90f6-5889-4432-954d-7057d8ed8d15 /tmp/issue333-head-ax8_kuqu
Traceback (most recent call last):
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-ax8_kuqu/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## fifth-run.log
```text
Evidence directory: /tmp/issue333-head-4kfyqrat
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-4kfyqrat/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because vite config has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 28529[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 26544[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 36729 914e1053-e87c-4795-b00d-e2cd3923ba1d /tmp/issue333-head-4kfyqrat
Traceback (most recent call last):
  File "/tmp/issue333-head-4kfyqrat/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-4kfyqrat/tree/docs/testes/issue333/head/react-journeys.py", line 76, in main
    assert not blocked,blocked
           ^^^^^^^^^^^
AssertionError: ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap']
[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:22:20
[2m   Duration [22m 31.07s[2m (transform 634ms, setup 84ms, collect 1.26s, tests 28.53s, environment 526ms, prepare 344ms)[22m

rowserslist/update-db#readme


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[31m[1mError[22m: Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 36729 914e1053-e87c-4795-b00d-e2cd3923ba1d /tmp/issue333-head-4kfyqrat
Traceback (most recent call last):
  File "/tmp/issue333-head-4kfyqrat/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-4kfyqrat/tree/docs/testes/issue333/head/react-journeys.py", line 76, in main
    assert not blocked,blocked
           ^^^^^^^^^^^
AssertionError: ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap', 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap']
[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## final-run-1.log
```text
STOP: unexpected changes since authorized base: 830399e24f6f77cf66c55ea0938a5076b53e98f0

```

## final-run-2.log
```text
Evidence directory: /tmp/issue333-head-ztwuucga
head-integration exit 1
      [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"2be9d733-9f76-49ac-9701-0b68eef08687"[31m
            [36m>[31m
              [0msynthetic.pdf[0m
              [0m — [0m
              [0mSem número[0m
              [0m — [0m
              [0mConcluída[0m
              [0m — [0m
              [0m18/10/2026, 00:29:04[0m
            [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"2e5d8b81-c772-496e-ac36-0d0cf889850a"[31m
            [36m>[31m
             ...

Ignored nodes: comments, script, style
[36m<body[31m
  [33mstyle[31m=[32m""[31m
[36m>[31m
  [36m<div>[31m
    [36m<div[31m
      [33mclass[31m=[32m"w-full space-y-4 mx-auto max-w-lg"[31m
    [36m>[31m
      [36m<div[31m
        [33mclass[31m=[32m"flex items-center gap-2"[31m
      [36m>[31m
        [36m<a[31m
          [33maria-label[31m=[32m"Voltar"[31m
          [33mclass[31m=[32m"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground h-10 w-10"[31m
          [33mhref[31m=[32m"/"[31m
        [36m>[31m
          [36m<svg[31m
            [33maria-hidden[31m=[32m"true"[31m
            [33mclass[31m=[32m"lucide lucide-arrow-left h-4 w-4"[31m
            [33mfill[31m=[32m"none"[31m
            [33mheight[31m=[32m"24"[31m
            [33mstroke[31m=[32m"currentColor"[31m
            [33mstroke-linecap[31m=[32m"round"[31m
            [33mstroke-linejoin[31m=[32m"round"[31m
            [33mstroke-width[31m=[32m"2"[31m
            [33mviewBox[31m=[32m"0 0 24 24"[31m
            [33mwidth[31m=[32m"24"[31m
            [33mxmlns[31m=[32m"http://www.w3.org/2000/svg"[31m
          [36m>[31m
            [36m<path[31m
              [33md[31m=[32m"m12 19-7-7 7-7"[31m
            [36m/>[31m
            [36m<path[31m
              [33md[31m=[32m"M19 12H5"[31m
            [36m/>[31m
          [36m</svg>[31m
        [36m</a>[31m
        [36m<div>[31m
          [36m<h1[31m
            [33mclass[31m=[32m"text-lg font-semibold flex items-center gap-2"[31m
          [36m>[31m
            [36m<svg[31m
              [33maria-hidden[31m=[32m"true"[31m
              [33mclass[31m=[32m"lucide lucide-scan-line h-5 w-5"[31m
              [33mfill[31m=[32m"none"[31m
              [33mheight[31m=[32m"24"[31m
              [33mstroke[31m=[32m"currentColor"[31m
              [33mstroke-linecap[31m=[32m"round"[31m
              [33mstroke-linejoin[31m=[32m"round"[31m
              [33mstroke-width[31m=[32m"2"[31m
              [33mviewBox[31m=[32m"0 0 24 24"[31m
              [33mwidth[31m=[32m"24"[31m
              [33mxmlns[31m=[32m"http://www.w3.org/2000/svg"[31m
            [36m>[31m
              [36m<path[31m
                [33md[31m=[32m"M3 7V5a2 2 0 0 1 2-2h2"[31m
              [36m/>[31m
              [36m<path[31m
                [33md[31m=[32m"M17 3h2a2 2 0 0 1 2 2v2"[31m
              [36m/>[31m
              [36m<path[31m
                [33md[31m=[32m"M21 17v2a2 2 0 0 1-2 2h-2"[31m
              [36m/>[31m
              [36m<path[31m
                [33md[31m=[32m"M7 21H5a2 2 0 0 1-2-2v-2"[31m
              [36m/>[31m
              [36m<path[31m
                [33md[31m=[32m"M7 12h10"[31m
              [36m/>[31m
            [36m</svg>[31m
            [0m Scanner de Faturas Avulsas[0m
          [36m</h1>[31m
          [36m<p[31m
            [33mclass[31m=[32m"text-xs text-muted-foreground"[31m
          [36m>[31m
            [0mSó documento + metadados. Não cria transação nem movimenta contas.[0m
          [36m</p>[31m
        [36m</div>[31m
      [36m</div>[31m
      [36m<div[31m
        [33mclass[31m=[32m"relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground bg-background text-foreground"[31m
        [33mrole[31m=[32m"alert"[31m
      [36m>[31m
        [36m<div[31m
          [33mclass[31m=[32m"text-sm [&_p]:leading-relaxed"[31m
        [36m>[31m
          [0mResultado por confirmar. A captura está bloqueada; confere a lista antes de qualquer nova gravação.[0m
        [36m</div>[31m
      [36m</div>[31m
      [36m<div[31m
        [33mclass[31m=[32m"space-y-2"[31m
      [36m>[31m
        [36m<div[31m
          [33mclass[31m=[32m"space-y-2 rounded-md border border-border p-3"[31m
        [36m>[31m
          [36m<div[31m
            [33mclass[31m=[32m"flex flex-wrap items-center gap-2"[31m
          [36m>[31m
            [36m<button[31m
              [33mclass[31m=[32m"inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"[31m
            [36m>[31m
              [0mProcurar as minhas tentativas[0m
            [36m</button>[31m
            [36m<span[31m
              [33mclass[31m=[32m"text-xs text-muted-foreground"[31m
            [36m>[31m
              [0m10[0m
              [0m carregada(s)[0m
            [36m</span>[31m
          [36m</div>[31m
          [36m<select[31m
            [33maria-label[31m=[32m"Tentativa a consultar"[31m
            [33mclass[31m=[32m"w-full rounded-md border border-input bg-background p-2 text-sm"[31m
          [36m>[31m
            [36m<option[31m
              [33mvalue[31m=[32m""[31m
            [36m>[31m
              [0mSelecionar tentativa[0m
            [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"012b5f90-0a49-4000-952a-b429b7fd95f4"[31m
            [36m>[31m
              [0msynthetic.pdf[0m
              [0m — [0m
              [0mFT1/23[0m
              [0m — [0m
              [0mConcluída[0m
              [0m — [0m
              [0m18/10/2026, 00:29:04[0m
            [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"11e63cf2-51d2-4f2d-9f51-c3082d0235cf"[31m
            [36m>[31m
              [0msynthetic.pdf[0m
              [0m — [0m
              [0mSem número[0m
              [0m — [0m
              [0mEm curso (por confirmar)[0m
              [0m — [0m
              [0m18/10/2026, 00:29:04[0m
            [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"2be9d733-9f76-49ac-9701-0b68eef08687"[31m
            [36m>[31m
              [0msynthetic.pdf[0m
              [0m — [0m
              [0mSem número[0m
              [0m — [0m
              [0mConcluída[0m
              [0m — [0m
              [0m18/10/2026, 00:29:04[0m
            [36m</option>[31m
            [36m<option[31m
              [33mvalue[31m=[32m"2e5d8b81-c772-496e-ac36-0d0cf889850a"[31m
            [36m>[31m
             ...[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 82[2mms[22m[39m
   [32m✓[39m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer[32m 266[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 16[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 23[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 29[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 16[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 59[2mms[22m[39m
   [32m✓[39m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[32m 45[2mms[22m[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 52[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 1369[2mms[22m[39m
   [32m✓[39m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination[32m 177[2mms[22m[39m
   [32m✓[39m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access[32m 169[2mms[22m[39m
   [32m✓[39m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice[32m 9[2mms[22m[39m
   [33m[2m✓[22m[39m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof [33m 304[2mms[22m[39m
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 41922[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 38071 d90f87e3-0580-472b-8121-9e0c2bdb035b /tmp/issue333-head-ztwuucga
Traceback (most recent call last):
  File "/tmp/issue333-head-ztwuucga/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ztwuucga/tree/docs/testes/issue333/head/react-journeys.py", line 62, in main
    await page.get_by_label('Tentativa a consultar',exact=True).select_option(prior)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 17476, in select_option
    await self._impl_obj.select_option(
    ...<7 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 579, in select_option
    return await self._frame.select_option(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 763, in select_option
    return await self._channel.send("selectOption", self._timeout, params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.select_option: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_label("Tentativa a consultar", exact=True)
    - locator resolved to <select aria-label="Tentativa a consultar" class="w-full rounded-md border border-input bg-background p-2 text-sm">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    30 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

[39m
   [32m✓[39m lost authorize attempt response then explicit execution request remains read-only[32m 16[2mms[22m[39m
   [32m✓[39m lost begin attempt response then explicit execution request remains read-only[32m 19[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m2 failed[39m[22m[2m | [22m[1m[32m24 passed[39m[22m[90m (26)[39m
[2m   Start at [22m 00:28:58
[2m   Duration [22m 52.20s[2m (transform 833ms, setup 103ms, collect 1.58s, tests 49.36s, environment 565ms, prepare 334ms)[22m

JSON report written to /tmp/issue333-head-ztwuucga/head-results.json
ncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ztwuucga/tree/docs/testes/issue333/head/react-journeys.py", line 62, in main
    await page.get_by_label('Tentativa a consultar',exact=True).select_option(prior)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 17476, in select_option
    await self._impl_obj.select_option(
    ...<7 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 579, in select_option
    return await self._frame.select_option(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 763, in select_option
    return await self._channel.send("selectOption", self._timeout, params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.select_option: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_label("Tentativa a consultar", exact=True)
    - locator resolved to <select aria-label="Tentativa a consultar" class="w-full rounded-md border border-input bg-background p-2 text-sm">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    30 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯[22m[39m



```

## final-run-3.log
```text
Evidence directory: /tmp/issue333-head-ir09d8kt
head-integration exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-ir09d8kt/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 38090[2mms[22m[39m
   [32m✓[39m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit[32m 211[2mms[22m[39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 104[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 102[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 252[2mms[22m[39m
   [32m✓[39m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[32m 166[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 752[2mms[22m[39m
   [33m[2m✓[22m[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice [33m 375[2mms[22m[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 104[2mms[22m[39m
   [33m[2m✓[22m[39m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer [33m 342[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 20[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 17[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 40[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 49[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 16[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 39[2mms[22m[39m
   [32m✓[39m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[32m 30[2mms[22m[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 63[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 1644[2mms[22m[39m
   [32m✓[39m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination[32m 214[2mms[22m[39m
   [32m✓[39m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access[32m 169[2mms[22m[39m
   [32m✓[39m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice[32m 15[2mms[22m[39m
   [33m[2m✓[22m[39m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof [33m 339[2mms[22m[39m
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 30747[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 45328 0a7ae55c-4132-4f96-b330-af4a67dbb2a1 /tmp/issue333-head-ir09d8kt
Traceback (most recent call last):
  File "/tmp/issue333-head-ir09d8kt/tree/docs/testes/issue333/head/react-journeys.py", line 94, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ir09d8kt/tree/docs/testes/issue333/head/react-journeys.py", line 67, in main
    await page.wait_for_function('(n)=>document.querySelectorAll("select[aria-label=\"Tentativa a consultar\"] option").length>n',arg=count)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 11479, in wait_for_function
    await self._impl_obj.wait_for_function(
    ...<4 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_page.py", line 1112, in wait_for_function
    return await self._main_frame.wait_for_function(**locals_to_params(locals()))
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 860, in wait_for_function
    await self._channel.send("waitForFunction", self._timeout, params)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.Error: Page.wait_for_function: SyntaxError: missing ) after argument list
    at eval (<anonymous>)
    at predicate (eval at evaluate (:290:30), <anonymous>:4:56)
    at next (eval at evaluate (:290:30), <anonymous>:29:29)
    at eval (eval at evaluate (:290:30), <anonymous>:42:9)
    at UtilityScript.evaluate (<anonymous>:292:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
[39m
   [32m✓[39m lost authorize attempt response then explicit execution request remains read-only[32m 18[2mms[22m[39m
   [32m✓[39m lost begin attempt response then explicit execution request remains read-only[32m 17[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m25 passed[39m[22m[90m (26)[39m
[2m   Start at [22m 00:30:06
[2m   Duration [22m 41.20s[2m (transform 794ms, setup 113ms, collect 1.60s, tests 38.09s, environment 636ms, prepare 433ms)[22m

JSON report written to /tmp/issue333-head-ir09d8kt/head-results.json
d: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 45328 0a7ae55c-4132-4f96-b330-af4a67dbb2a1 /tmp/issue333-head-ir09d8kt
Traceback (most recent call last):
  File "/tmp/issue333-head-ir09d8kt/tree/docs/testes/issue333/head/react-journeys.py", line 94, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ir09d8kt/tree/docs/testes/issue333/head/react-journeys.py", line 67, in main
    await page.wait_for_function('(n)=>document.querySelectorAll("select[aria-label=\"Tentativa a consultar\"] option").length>n',arg=count)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 11479, in wait_for_function
    await self._impl_obj.wait_for_function(
    ...<4 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_page.py", line 1112, in wait_for_function
    return await self._main_frame.wait_for_function(**locals_to_params(locals()))
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 860, in wait_for_function
    await self._channel.send("waitForFunction", self._timeout, params)
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.Error: Page.wait_for_function: SyntaxError: missing ) after argument list
    at eval (<anonymous>)
    at predicate (eval at evaluate (:290:30), <anonymous>:4:56)
    at next (eval at evaluate (:290:30), <anonymous>:29:29)
    at eval (eval at evaluate (:290:30), <anonymous>:42:9)
    at UtilityScript.evaluate (<anonymous>:292:16)
    at UtilityScript.<anonymous> (<anonymous>:1:44)
[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## final-run-4.log
```text
Evidence directory: /tmp/issue333-head-6qn62he5
head-integration exit 0
ui-client exit 0
pg-attempts exit 0
entry-chromium exit 0
general exit 0
tsgo exit 0
deno exit 0
build exit 0
PASS executed suites only; coverage limitations remain; Cloud not exercised

```

## final-run-5.log
```text
Evidence directory: /tmp/issue333-head-zqqah7m4
head-integration exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-zqqah7m4/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m)[22m[33m 33021[2mms[22m[39m
   [33m[2m✓[22m[39m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit [33m 311[2mms[22m[39m
   [32m✓[39m no authorization/stale preview/foreign owner and tenant cannot create an invoice[32m 112[2mms[22m[39m
   [32m✓[39m lost commit response and failed read-only check preserve candidate; recovery reads one effect[32m 134[2mms[22m[39m
   [32m✓[39m two SQL connections at real row lock: one effect; gate closing while waiting denies commit[32m 245[2mms[22m[39m
   [32m✓[39m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review[32m 148[2mms[22m[39m
   [33m[2m✓[22m[39m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter [33m 863[2mms[22m[39m
   [33m[2m✓[22m[39m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice [33m 334[2mms[22m[39m
   [32m✓[39m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again[32m 78[2mms[22m[39m
   [33m[2m✓[22m[39m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer [33m 359[2mms[22m[39m
   [32m✓[39m lost response after reserve preserves bytes and destination; recovery is read-only[32m 16[2mms[22m[39m
   [32m✓[39m lost response after upload preserves bytes and destination; recovery is read-only[32m 39[2mms[22m[39m
   [32m✓[39m lost response after receipt preserves bytes and destination; recovery is read-only[32m 33[2mms[22m[39m
   [32m✓[39m lost response after commit preserves bytes and destination; recovery is read-only[32m 41[2mms[22m[39m
   [32m✓[39m lost response after check preserves bytes and destination; recovery is read-only[32m 32[2mms[22m[39m
   [32m✓[39m real SQL rollback after mutation before audit leaves zero effect and persistent reservation[32m 20[2mms[22m[39m
   [32m✓[39m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice[32m 35[2mms[22m[39m
   [32m✓[39m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced[32m 35[2mms[22m[39m
   [32m✓[39m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects[32m 55[2mms[22m[39m
   [33m[2m✓[22m[39m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud [33m 5027[2mms[22m[39m
   [32m✓[39m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination[32m 250[2mms[22m[39m
   [32m✓[39m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access[32m 220[2mms[22m[39m
   [32m✓[39m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice[32m 17[2mms[22m[39m
   [33m[2m✓[22m[39m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof [33m 488[2mms[22m[39m
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 11636[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 62879 56fbb8e0-e93c-4ba6-830f-c7dde6902bd8 /tmp/issue333-head-zqqah7m4 09c8f62a-9f0c-4182-865c-18c1068b2184
Traceback (most recent call last):
  File "/tmp/issue333-head-zqqah7m4/tree/docs/testes/issue333/head/react-journeys.py", line 4, in <module>
    port,prior,evidence=sys.argv[1:]; root=Path(evidence); url='http://127.0.0.1:'+port
    ^^^^^^^^^^^^^^^^^^^
ValueError: too many values to unpack (expected 3)
[39m
   [32m✓[39m lost authorize attempt response then explicit execution request remains read-only[32m 148[2mms[22m[39m
   [32m✓[39m lost begin attempt response then explicit execution request remains read-only[32m 36[2mms[22m[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m25 passed[39m[22m[90m (26)[39m
[2m   Start at [22m 00:32:54
[2m   Duration [22m 48.06s[2m (transform 1.56s, setup 994ms, collect 8.59s, tests 33.02s, environment 4.01s, prepare 630ms)[22m

JSON report written to /tmp/issue333-head-zqqah7m4/head-results.json
/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:27:15
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:256:58
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:33:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/node_modules/@radix-ui/react-slot/dist/index.mjs:9:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/node_modules/@radix-ui/react-primitive/dist/index.mjs:28:13
    at file:///dev-server/node_modules/@radix-ui/react-portal/dist/index.mjs:11:22
    at SelectPortal
    at /tmp/issue333-head-zqqah7m4/tree/src/components/ui/select.tsx:92:59
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-collection/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at CollectionProvider (file:///dev-server/node_modules/@radix-ui/react-collection/dist/index.mjs:17:13)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-select/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Provider (file:///dev-server/node_modules/@radix-ui/react-popper/node_modules/@radix-ui/react-context/dist/index.mjs:27:15)
    at Popper (file:///dev-server/node_modules/@radix-ui/react-popper/dist/index.mjs:30:11)
    at Select (file:///dev-server/node_modules/@radix-ui/react-select/dist/index.mjs:42:5)
    at div
    at div
    at div
    at AccountantStandaloneInvoicesTab (/tmp/issue333-head-zqqah7m4/tree/src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx:64:36)
    at QueryClientProvider (file:///dev-server/node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js:20:3)


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[31m[1mError[22m: Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 62879 56fbb8e0-e93c-4ba6-830f-c7dde6902bd8 /tmp/issue333-head-zqqah7m4 09c8f62a-9f0c-4182-865c-18c1068b2184
Traceback (most recent call last):
  File "/tmp/issue333-head-zqqah7m4/tree/docs/testes/issue333/head/react-journeys.py", line 4, in <module>
    port,prior,evidence=sys.argv[1:]; root=Path(evidence); url='http://127.0.0.1:'+port
    ^^^^^^^^^^^^^^^^^^^
ValueError: too many values to unpack (expected 3)
[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## final-run-6.log
```text
Evidence directory: /tmp/issue333-head-29p36gir
head-integration exit 0
ui-client exit 0
pg-attempts exit 0
entry-chromium exit 0
general exit 0
tsgo exit 0
deno exit 0
build exit 0
PASS executed suites only; coverage limitations remain; Cloud not exercised

```

## first-run.log
```text
STOP: unexpected changes since authorized base: 3728a702162950e502a1183329cb2868bc76fd91

```

## fourth-run.log
```text
Evidence directory: /tmp/issue333-head-milbasrd
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-milbasrd/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because vite config has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m24 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m23 skipped[39m[2m)[22m[33m 26808[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 25030[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 35823 b12e1c0b-10a3-4451-b195-e87abbe2537f /tmp/issue333-head-milbasrd
Traceback (most recent call last):
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 28, in entry
    await page.get_by_label('Quem pagou',exact=True).select_option('22222222-2222-4222-8222-222222222222')
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 17476, in select_option
    await self._impl_obj.select_option(
    ...<7 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 579, in select_option
    return await self._frame.select_option(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 763, in select_option
    return await self._channel.send("selectOption", self._timeout, params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.select_option: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_label("Quem pagou", exact=True)

[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m23 skipped[39m[90m (24)[39m
[2m   Start at [22m 00:21:44
[2m   Duration [22m 29.02s[2m (transform 561ms, setup 81ms, collect 1.09s, tests 26.81s, environment 480ms, prepare 317ms)[22m

 pages/clients/handlers/PG and owner recovery
[31m[1mError[22m: Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 35823 b12e1c0b-10a3-4451-b195-e87abbe2537f /tmp/issue333-head-milbasrd
Traceback (most recent call last):
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-milbasrd/tree/docs/testes/issue333/head/react-journeys.py", line 28, in entry
    await page.get_by_label('Quem pagou',exact=True).select_option('22222222-2222-4222-8222-222222222222')
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 17476, in select_option
    await self._impl_obj.select_option(
    ...<7 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 579, in select_option
    return await self._frame.select_option(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 763, in select_option
    return await self._channel.send("selectOption", self._timeout, params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.select_option: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_label("Quem pagou", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## ninth-run.log
```text
Evidence directory: /tmp/issue333-head-twf17c7_
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-twf17c7_/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 20700[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 18664[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 63729 9b969bba-94f1-4401-b64e-9404da5342d6 /tmp/issue333-head-twf17c7_
Traceback (most recent call last):
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:25:08
[2m   Duration [22m 23.34s[2m (transform 695ms, setup 94ms, collect 1.42s, tests 20.70s, environment 575ms, prepare 296ms)[22m

issue333/head/react-journeys.py 63729 9b969bba-94f1-4401-b64e-9404da5342d6 /tmp/issue333-head-twf17c7_
Traceback (most recent call last):
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-twf17c7_/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## second-run.log
```text
Evidence directory: /tmp/issue333-head-rx26kwri
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-rx26kwri/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m24 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m23 skipped[39m[2m)[22m[33m 2205[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[32m 99[2mms[22m[39m
[31m     → Invariant violation: "new TextEncoder().encode("") instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m23 skipped[39m[90m (24)[39m
[2m   Start at [22m 00:20:27
[2m   Duration [22m 4.90s[2m (transform 650ms, setup 96ms, collect 1.34s, tests 2.20s, environment 625ms, prepare 337ms)[22m


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m

[41m[1m FAIL [22m[49m docs/testes/issue333/head/flows.test.tsx[2m > [22mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[31m[1mError[22m: Invariant violation: "new TextEncoder().encode("") instanceof Uint8Array" is incorrectly false

This indicates that your JavaScript environment is broken. You cannot use
esbuild in this environment because esbuild relies on this invariant. This
is not a problem with esbuild. You need to fix your environment instead.
[39m
[90m [2m❯[22m Object.<anonymous> ../../../dev-server/node_modules/vite/node_modules/esbuild/lib/main.js:[2m201:9[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## seventh-run.log
```text
Evidence directory: /tmp/issue333-head-l53zrd1v
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-l53zrd1v/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because vite config has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 20625[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 18731[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 63058 1f265ceb-123a-42cc-a266-57aea44637f3 /tmp/issue333-head-l53zrd1v
Traceback (most recent call last):
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:24:03
[2m   Duration [22m 23.05s[2m (transform 565ms, setup 83ms, collect 1.10s, tests 20.63s, environment 609ms, prepare 367ms)[22m

issue333/head/react-journeys.py 63058 1f265ceb-123a-42cc-a266-57aea44637f3 /tmp/issue333-head-l53zrd1v
Traceback (most recent call last):
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-l53zrd1v/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## sixth-run.log
```text
Evidence directory: /tmp/issue333-head-ey1jodnw
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-ey1jodnw/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because vite config has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 20888[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 18986[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 21041 cd235143-3613-46f5-926a-5a0c4b50ef91 /tmp/issue333-head-ey1jodnw
Traceback (most recent call last):
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.get_by_role('button',name='Novo lote',exact=True).click()
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:23:31
[2m   Duration [22m 23.57s[2m (transform 638ms, setup 85ms, collect 1.31s, tests 20.89s, environment 639ms, prepare 374ms)[22m

owner recovery
[31m[1mError[22m: Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 21041 cd235143-3613-46f5-926a-5a0c4b50ef91 /tmp/issue333-head-ey1jodnw
Traceback (most recent call last):
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-ey1jodnw/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.get_by_role('button',name='Novo lote',exact=True).click()
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## tenth-run.log
```text
Evidence directory: /tmp/issue333-head-qv07n30g
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-qv07n30g/tree[39m

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m26 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m25 skipped[39m[2m)[22m[33m 21741[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 19262[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 51267 8b61c4d2-af2d-475e-9fdd-d3661e958ed3 /tmp/issue333-head-qv07n30g
Traceback (most recent call last):
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
   [2m[90m↓[39m[22m lost authorize attempt response then explicit execution request remains read-only
   [2m[90m↓[39m[22m lost begin attempt response then explicit execution request remains read-only

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m25 skipped[39m[90m (26)[39m
[2m   Start at [22m 00:25:43
[2m   Duration [22m 24.13s[2m (transform 619ms, setup 82ms, collect 1.25s, tests 21.74s, environment 509ms, prepare 292ms)[22m

issue333/head/react-journeys.py 51267 8b61c4d2-af2d-475e-9fdd-d3661e958ed3 /tmp/issue333-head-qv07n30g
Traceback (most recent call last):
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-qv07n30g/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.wait_for_timeout(200);print('PAGE',label,errors,flush=True);await page.get_by_role('button',name='Novo lote',exact=True).click()
                                                                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## third-run.log
```text
Evidence directory: /tmp/issue333-head-adfg35tv
react-proof32 exit 1

[1m[46m RUN [49m[22m [36mv3.2.7 [39m[90m/tmp/issue333-head-adfg35tv/tree[39m

[90mstdout[2m | docs/testes/issue333/head/flows.test.tsx[2m > [22m[2mProof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery
[22m[39mRe-optimizing dependencies because lockfile has changed

 [31m❯[39m docs/testes/issue333/head/flows.test.tsx [2m([22m[2m24 tests[22m[2m | [22m[31m1 failed[39m[2m | [22m[33m23 skipped[39m[2m)[22m[33m 43880[2mms[22m[39m
   [2m[90m↓[39m[22m real handler upload/preview/authorization/SQL/bytes/read-only check: one avulsa, immutable fiscal data and audit
   [2m[90m↓[39m[22m no authorization/stale preview/foreign owner and tenant cannot create an invoice
   [2m[90m↓[39m[22m lost commit response and failed read-only check preserve candidate; recovery reads one effect
   [2m[90m↓[39m[22m two SQL connections at real row lock: one effect; gate closing while waiting denies commit
   [2m[90m↓[39m[22m new intention is executable with verified original bytes; different family doesn't invalidate; VAT/strong duplicate are review
   [2m[90m↓[39m[22m real DataEntryDialog + default client + handler + SQL + disk bytes reaches checked success, not a demo adapter
   [2m[90m↓[39m[22m scanner discovery -> explicit new intention -> original file -> real client/attempt endpoint/SQL creates and checks exactly one invoice
   [2m[90m↓[39m[22m prepared-reservation UI rejects altered bytes; inprogress reservation is read-only and cannot upload again
   [2m[90m↓[39m[22m actual scanner capture -> manual fields -> save -> typed client/attempt handler/SQL, no OCR or legacy writer
   [2m[90m↓[39m[22m lost response after reserve preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after upload preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after receipt preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after commit preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m lost response after check preserves bytes and destination; recovery is read-only
   [2m[90m↓[39m[22m real SQL rollback after mutation before audit leaves zero effect and persistent reservation
   [2m[90m↓[39m[22m accountant_edit SQL checks canonical before-row, detects concurrent edit and retains one original invoice
   [2m[90m↓[39m[22m SQL/Storage divergence is pending; immutable identity/audit and ASCII-only strong key are enforced
   [2m[90m↓[39m[22m closed gates deny all four preparation mutations, client tables and service-only capability; existing owner read has no effects
   [2m[90m↓[39m[22m Chromium performs actual preflight and HTTP execute against real attempt handler + SQL + persistent bytes; no Cloud
   [2m[90m↓[39m[22m real ingest entrypoint v1/v2 with SQL mutations and disk readback preserves four currencies; v2 new UUID reuses destination
   [2m[90m↓[39m[22m canonical endpoint pages actual owner rows with cursor; populated owner/tenant isolation, no client table access
   [2m[90m↓[39m[22m attempt endpoint rejects anon/forged context/truncated MIME/oversized stream and never creates an invoice
   [2m[90m↓[39m[22m actual accountant editor UI -> client -> attempt endpoint -> SQL updates only metadata with before-row and bytes proof
[31m   [31m×[31m Proof32 React Chromium journeys through production pages/clients/handlers/PG and owner recovery[39m[33m 41615[2mms[22m[39m
[31m     → Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 38507 abf84bdf-fde4-4eda-83bf-7b94372c779d /tmp/issue333-head-adfg35tv
Traceback (most recent call last):
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.get_by_role('button',name='Novo lote',exact=True).click()
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m

[2m Test Files [22m [1m[31m1 failed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[33m23 skipped[39m[90m (24)[39m
[2m   Start at [22m 00:20:45
[2m   Duration [22m 46.62s[2m (transform 664ms, setup 106ms, collect 1.35s, tests 43.88s, environment 674ms, prepare 362ms)[22m

owner recovery
[31m[1mError[22m: Command failed: /nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/bin/python3.13 docs/testes/issue333/head/react-journeys.py 38507 abf84bdf-fde4-4eda-83bf-7b94372c779d /tmp/issue333-head-adfg35tv
Traceback (most recent call last):
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 80, in <module>
    asyncio.run(main())
    ~~~~~~~~~~~^^^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 195, in run
    return runner.run(main)
           ~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/runners.py", line 118, in run
    return self._loop.run_until_complete(task)
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^
  File "/nix/store/44rn0p64x92bnnh7cwn6x6ybvflybmvz-python3-3.13.12/lib/python3.13/asyncio/base_events.py", line 725, in run_until_complete
    return future.result()
           ~~~~~~~~~~~~~^^
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 30, in main
    await entry('success');await shot('32-entry-preview')
    ^^^^^^^^^^^^^^^^^^^^^^
  File "/tmp/issue333-head-adfg35tv/tree/docs/testes/issue333/head/react-journeys.py", line 25, in entry
    await page.goto(url+'/entry');await page.get_by_role('button',name='Novo lote',exact=True).click()
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/async_api/_generated.py", line 15527, in click
    await self._impl_obj.click(
    ...<9 lines>...
    )
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_locator.py", line 160, in click
    return await self._frame.click(self._selector, strict=True, **params)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_frame.py", line 549, in click
    await self._channel.send("click", self._timeout, locals_to_params(locals()))
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 69, in send
    return await self._connection.wrap_api_call(
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "/nix/store/zccmygwl3jqyv571gxx7pnghrp1fs8xh-sandbox-python-env/lib/python3.13/site-packages/playwright/_impl/_connection.py", line 559, in wrap_api_call
    raise rewrite_error(error, f"{parsed_st['apiName']}: {error}") from None
playwright._impl._errors.TimeoutError: Locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for get_by_role("button", name="Novo lote", exact=True)

[39m
[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m



```

## twelfth-run.log
```text
Evidence directory: /tmp/issue333-head-bmukv49k
react-proof32 exit 0
PASS executed suites only; coverage limitations remain; Cloud not exercised

```
