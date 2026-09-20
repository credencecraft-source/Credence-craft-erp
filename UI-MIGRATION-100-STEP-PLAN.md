# ERP UI Migration: 100-Step Execution Plan

Status legend: `[ ]` not started, `[-]` in progress, `[x]` completed.

## Phase 1: Baseline and Contracts

- [x] 1. Audit raw controls by module.
- [ ] 2. Record baseline lint, typecheck, build, and UI-warning counts.
- [ ] 3. Define approved raw-control exceptions.
- [ ] 4. Add a compact field contract for table editors.
- [ ] 5. Add icon-only Button sizing.
- [ ] 6. Add compact Checkbox sizing.
- [ ] 7. Add compact Select sizing.
- [ ] 8. Add compact Input sizing.
- [ ] 9. Add shared form error/status presentation.
- [ ] 10. Document migration ownership by module.

## Phase 2: Inventory Completion

- [ ] 11. Migrate GRN purchase-order receiving fields.
- [ ] 12. Migrate GRN receiving quantity editors.
- [ ] 13. Migrate GRN receiving submit actions.
- [ ] 14. Migrate gate-entry direction controls.
- [ ] 15. Migrate gate-entry movement controls.
- [ ] 16. Migrate gate-entry submit and lookup actions.
- [ ] 17. Migrate finished-goods stock form inputs.
- [ ] 18. Migrate finished-goods stock selects.
- [ ] 19. Migrate finished-goods stock submit actions.
- [ ] 20. Migrate finished-goods stock detail fields.

## Phase 3: Merchandising Order Shell

- [ ] 21. Migrate order-detail quick-master fields.
- [ ] 22. Migrate order-detail quick-master picklists.
- [ ] 23. Migrate order-detail quick-master lookup fields.
- [ ] 24. Migrate Order Details tab selectors.
- [ ] 25. Migrate Order Details tab inputs.
- [ ] 26. Migrate Order Details tab checkboxes.
- [ ] 27. Migrate Finished Goods row editors.
- [ ] 28. Migrate Finished Goods master selectors.
- [ ] 29. Migrate Finished Goods calculated fields.
- [ ] 30. Migrate Finished Goods action controls.

## Phase 4: Merchandising Editors

- [x] 31. Migrate Process tab template select.
- [x] 32. Migrate Process tab row inputs.
- [x] 33. Migrate Process tab action buttons.
- [x] 34. Migrate Measurements tab inputs.
- [x] 35. Migrate Measurements tab row actions.
- [ ] 36. Migrate T&A row date fields.
- [ ] 37. Migrate T&A row status fields.
- [ ] 38. Migrate T&A row remarks fields.
- [ ] 39. Migrate ASN row editors.
- [ ] 40. Migrate technical-pack actions and print controls.

## Phase 5: Procurement Completion

- [ ] 41. Migrate style-wise allocation search.
- [ ] 42. Migrate style-wise allocation cards.
- [ ] 43. Migrate style-wise allocation selection controls.
- [ ] 44. Migrate grouped PO vendor selection.
- [ ] 45. Migrate grouped PO quantity editors.
- [ ] 46. Migrate price approval actions.
- [ ] 47. Migrate price approval row selection.
- [ ] 48. Migrate price approval field editors.
- [ ] 49. Migrate Master PO generation controls.
- [ ] 50. Migrate general PO workflow controls.

## Phase 6: Reports and Data Tables

- [ ] 51. Standardize GRN report table wrappers.
- [ ] 52. Standardize inventory report table wrappers.
- [ ] 53. Standardize procurement report table wrappers.
- [ ] 54. Standardize merchandising report table wrappers.
- [ ] 55. Standardize factory report table wrappers.
- [ ] 56. Standardize finance report table wrappers.
- [ ] 57. Add shared table empty states.
- [ ] 58. Add shared table loading states.
- [ ] 59. Add shared table selection behavior.
- [ ] 60. Add shared table row-action behavior.

## Phase 7: POS

- [ ] 61. Migrate POS barcode search controls.
- [ ] 62. Migrate POS billing inputs.
- [ ] 63. Migrate POS billing selects.
- [ ] 64. Migrate POS line-item editors.
- [ ] 65. Migrate POS payment controls.
- [ ] 66. Migrate purchase-bill entry steps.
- [ ] 67. Migrate purchase-bill item selectors.
- [ ] 68. Migrate purchase-bill quantity and price editors.
- [ ] 69. Migrate POS report actions.
- [ ] 70. Migrate POS dialogs and confirmations.

## Phase 8: Factory and Finance

- [ ] 71. Migrate factory work-order form fields.
- [ ] 72. Migrate factory BOM editors.
- [ ] 73. Migrate factory production update fields.
- [ ] 74. Migrate factory WIP actions.
- [ ] 75. Migrate factory quality controls.
- [ ] 76. Migrate finance transaction form fields.
- [ ] 77. Migrate finance invoice actions.
- [ ] 78. Migrate finance approval actions.
- [ ] 79. Migrate finance report filters.
- [ ] 80. Migrate finance table editors.

## Phase 9: Platform and Organization Administration

- [ ] 81. Migrate platform subscription forms.
- [ ] 82. Migrate platform email configuration.
- [ ] 83. Migrate platform database forms.
- [ ] 84. Migrate platform business-type forms.
- [ ] 85. Migrate platform support-ticket controls.
- [ ] 86. Migrate organization creation forms.
- [ ] 87. Migrate organization user forms.
- [ ] 88. Migrate organization role permissions.
- [ ] 89. Migrate organization tax-rule forms.
- [ ] 90. Migrate organization pricing controls.

## Phase 10: Enforcement and Release

- [ ] 91. Add raw-table detection to the UI rule.
- [ ] 92. Add explicit exception syntax for specialized editors.
- [ ] 93. Remove temporary migration exceptions.
- [ ] 94. Change UI lint warnings to errors.
- [ ] 95. Add changed-file UI lint enforcement.
- [ ] 96. Run accessibility keyboard smoke checks.
- [ ] 97. Run responsive UI smoke checks.
- [ ] 98. Run lint, typecheck, and dependency audit.
- [ ] 99. Resolve or document production build blockers.
- [ ] 100. Publish the final UI adoption report.

## Execution Rule

Complete one numbered step at a time. After each code step, run the narrowest focused validation, update this checklist, and only then start the next step.

## Execution Notes

- Step 11 is deferred because the purchase-order receiving page is compressed into a single JSX return and needs a deliberate structural refactor before safe primitive replacement.
- Step 31 is complete. Focused TypeScript diagnostics and ESLint both pass for `ProcessTab.tsx`.
- Steps 32 and 33 were completed with Step 31 because the Process tab row price editor and section actions share the same control slice.
- Steps 34 and 35 are complete. Focused TypeScript diagnostics and ESLint both pass for `MeasurementsTab.tsx`.
