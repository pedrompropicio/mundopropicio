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
