# Architecture rules

- BP grid saves use `batch_save_event_forecasts` to commit snapshots, inserts and edits atomically; failed writes must leave no snapshot behind.
- Forecast edit undo stores only changed fields and validates amount restoration through `writeForecastAmount` before restoring other fields; this preserves the existing reduction observation and realized-value floor.
- Nested dialogs use the shared overlay stack and Radix focus management rather than fixed z-index values; this keeps portals above their parent modal.