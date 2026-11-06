# TASK-019 research supplement for subsequent full catalog contract
Recorded by Codex, 2026-11-06. Read-only ElementTree scan of the two user-provided source files; not a review or architecture decision.

The first-error inventory hides subsequent enum issues. Complete ENUM scan found:
- CP4.2.2 DemDTCSeverity default DEM_DTC_SEV_NO_SEVERITY is absent from the 4 declared literals (which include DEM_SEVERITY_NO_SEVERITY).
- CP4.2.2 DemEventMemoryEntryStorageTrigger default DEM_STORAGE_ON_TEST_FAILED is absent from its literals (which include DEM_TRIGGER_ON_TEST_FAILED).
- CP4.2.2 FrTrcvInitState default FRTRCV_OP_MODE_NORMAL is absent from literals (which include FRTRCV_TRCVMODE_NORMAL).
These are source facts, not authorization to substitute values. Suggested handling: preserve invalid source default as provenance/diagnostic; offer valid enum options without preconfiguring an invented replacement. WorkBuddy to specify contract.

Both releases have empty enums: AdcClockSource, AdcHwUnitId, AdcChannelRefVoltsrcHigh, AdcChannelRefVoltsrcLow, OcuClockSource, OcuPrescale.
OcuClockSource DESC explicitly says enumeration literals are vendor-specific. Empty values are not automatically parser errors or permission to invent chip-specific enumerations. Full module catalog must distinguish selectable modules from hardware-specific field limitations.

Type counts: CP4.2.2 symbolic-name references 247, linker-symbol 5, multiline-string 2, add-info 1. CP4.4.0 URI references 11, linker-symbol 4, multiline-string 2, add-info 1.
Source hashes and module inventory remain evidence/task019/fullcatalog-source-inventory.json and TASK-019-USER-ADDENDUM.md. No source files or application code modified.

## Contract dependency found while reading the new draft
CP4.2.2 Dem contains FOUR ECUC-SYMBOLIC-NAME-REFERENCE-DEF entries (in addition to 37 ordinary, 11 choice, 3 foreign, 3 instance). Therefore enum fixes alone cannot make Dem parse: after the enum check is fixed, unsupported SYMBOLIC-NAME becomes the next failure. TASK-021 draft B1/F1 require Dem parsed but B2 explicitly postpones all symbolic-reference implementation. Please move minimal correct symbolic-reference support needed by Dem into B1, or otherwise resolve this contradiction without silent omission. This is a factual dependency, not a new requested product feature. CP4.4.0 Adc/Ocu have ordinary reference types only.
